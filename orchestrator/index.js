const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const MessageService = require('../shared/MessageService');
const { EVENTS } = require('../shared/constants');

// Initialize express app
const app = express();
app.use(express.json());
const PORT = 3000;

// Store for tracking saga state
const sagaStore = {};

// Store for registered services
const serviceRegistry = {};

// Servicio de mensajería
const messageService = new MessageService('orchestrator');

/**
 * Registra un servicio en el orquestador
 * @param {Object} serviceContract - Contrato del servicio según definido en shared/contracts.js
 */
function registerService(serviceContract) {
  if (!serviceContract || !serviceContract.name) {
    throw new Error('El contrato del servicio debe incluir un nombre');
  }

  console.log(`Registrando servicio: ${serviceContract.name}`);
  
  // Registrar el servicio con su contrato
  serviceRegistry[serviceContract.name] = {
    ...serviceContract,
    active: true,
    registeredAt: new Date()
  };
  
  return serviceContract.name;
}

/**
 * Carga todos los servicios disponibles en la carpeta services
 */
async function loadServices() {
  try {
    const servicesDir = path.join(__dirname, 'services');
    
    // Asegurarse de que la carpeta services existe
    if (!fs.existsSync(servicesDir)) {
      console.log('Carpeta services no encontrada. Creándola...');
      fs.mkdirSync(servicesDir);
    }
    
    const serviceFiles = fs.readdirSync(servicesDir);
    
    for (const serviceFile of serviceFiles) {
      if (serviceFile.endsWith('.js')) {
        try {
          const servicePath = path.join(servicesDir, serviceFile);
          const service = require(servicePath);
          
          if (service.contract) {
            registerService(service.contract);
            console.log(`Servicio cargado: ${service.contract.name}`);
          } else {
            console.warn(`Advertencia: El archivo ${serviceFile} no exporta un contrato de servicio válido.`);
          }
        } catch (error) {
          console.error(`Error cargando servicio ${serviceFile}:`, error);
        }
      }
    }
    
    console.log(`Servicios registrados: ${Object.keys(serviceRegistry).length}`);
  } catch (error) {
    console.error('Error cargando servicios:', error);
  }
}

/**
 * Registra manualmente los microservicios del sistema
 * En una implementación real, los servicios se registrarían dinámicamente
 */
function registerCoreServices() {
  const { inventoryServiceContract, paymentServiceContract, orderServiceContract } = require('../shared/contracts');
  
  registerService(inventoryServiceContract);
  registerService(paymentServiceContract);
  registerService(orderServiceContract);
}

async function setupMessageService() {
  try {
    // Inicializar el servicio de mensajería
    await messageService.initialize();
    
    // Crear canal del orquestador
    await messageService.createQueue('orchestrator_queue');
    
    // Crear canales para todos los servicios registrados
    for (const serviceName in serviceRegistry) {
      const service = serviceRegistry[serviceName];
      await messageService.createQueue(service.queueName);
    }
    
    // Suscribirse al canal del orquestador
    await messageService.subscribe('orchestrator_queue', handleMessage);
    
    console.log('Orquestador listo para procesar mensajes');
  } catch (error) {
    console.error('Error configurando servicio de mensajería:', error);
    process.exit(1);
  }
}

// Message handler for orchestrator
async function handleMessage(content, message) {
  console.log(`Orquestador procesando mensaje: ${content.type}`);
  
  // Buscar el manejador específico para este tipo de evento
  const handler = findEventHandler(content.type);
  
  if (handler) {
    try {
      await handler(content);
    } catch (error) {
      console.error(`Error procesando evento ${content.type}:`, error);
    }
  } else {
    console.log(`No hay manejador para el evento: ${content.type}`);
  }
  
  // Confirmar el procesamiento del mensaje
  messageService.acknowledge(message);
}

/**
 * Encuentra el manejador adecuado para un tipo de evento
 */
function findEventHandler(eventType) {
  const handlers = {
    [EVENTS.ORDER_CREATED]: handleOrderCreated,
    [EVENTS.INVENTORY_CHECK_SUCCEEDED]: handleInventoryCheckSuccess,
    [EVENTS.INVENTORY_CHECK_FAILED]: handleInventoryCheckFailure,
    [EVENTS.PAYMENT_SUCCEEDED]: handlePaymentSuccess,
    [EVENTS.PAYMENT_FAILED]: handlePaymentFailure
  };
  
  return handlers[eventType];
}

// Handle ORDER_CREATED event
async function handleOrderCreated(content) {
  const { orderId, customerId, items, totalAmount } = content.data;
  
  // Create new saga state
  sagaStore[orderId] = {
    id: orderId,
    customerId,
    items,
    totalAmount,
    status: 'INVENTORY_CHECK_PENDING',
    startedAt: new Date(),
    steps: [
      { type: EVENTS.ORDER_CREATED, timestamp: new Date(), data: content.data }
    ]
  };
  
  console.log(`Iniciando saga para la orden: ${orderId}`);
  
  // Request inventory check usando el servicio registrado
  const inventoryService = serviceRegistry['inventory-service'];
  if (!inventoryService) {
    console.error('Servicio de inventario no registrado');
    return;
  }
  
  await messageService.publish(inventoryService.queueName, {
    type: EVENTS.INVENTORY_CHECK_REQUESTED,
    data: {
      orderId,
      items
    }
  });
}

// Handle INVENTORY_CHECK_SUCCEEDED event
async function handleInventoryCheckSuccess(content) {
  const { orderId, reservationId } = content.data;
  const saga = sagaStore[orderId];
  
  if (!saga) {
    console.error(`Saga no encontrada para la orden: ${orderId}`);
    return;
  }
  
  // Update saga state
  saga.status = 'PAYMENT_PENDING';
  saga.reservationId = reservationId;
  saga.steps.push({ type: EVENTS.INVENTORY_CHECK_SUCCEEDED, timestamp: new Date(), data: content.data });
  
  console.log(`Verificación de inventario exitosa para la orden: ${orderId}. Procediendo al pago.`);
  
  // Request payment usando el servicio registrado
  const paymentService = serviceRegistry['payment-service'];
  if (!paymentService) {
    console.error('Servicio de pagos no registrado');
    return;
  }
  
  await messageService.publish(paymentService.queueName, {
    type: EVENTS.PAYMENT_REQUESTED,
    data: {
      orderId,
      customerId: saga.customerId,
      amount: saga.totalAmount
    }
  });
}

// Handle INVENTORY_CHECK_FAILED event
async function handleInventoryCheckFailure(content) {
  const { orderId, reason, insufficientItems } = content.data;
  const saga = sagaStore[orderId];
  
  if (!saga) {
    console.error(`Saga no encontrada para la orden: ${orderId}`);
    return;
  }
  
  // Update saga state
  saga.status = 'FAILED';
  saga.failureReason = reason;
  saga.insufficientItems = insufficientItems;
  saga.steps.push({ type: EVENTS.INVENTORY_CHECK_FAILED, timestamp: new Date(), data: content.data });
  
  console.log(`Verificación de inventario fallida para la orden: ${orderId}. Razón: ${reason}`);
  
  // Notify order service about failure
  const orderService = serviceRegistry['order-service'];
  if (!orderService) {
    console.error('Servicio de órdenes no registrado');
    return;
  }
  
  await messageService.publish(orderService.queueName, {
    type: EVENTS.ORDER_CANCELLED,
    data: {
      orderId,
      reason,
      insufficientItems
    }
  });
}

// Handle PAYMENT_SUCCEEDED event
async function handlePaymentSuccess(content) {
  const { orderId, transactionId } = content.data;
  const saga = sagaStore[orderId];
  
  if (!saga) {
    console.error(`Saga no encontrada para la orden: ${orderId}`);
    return;
  }
  
  // Update saga state
  saga.status = 'COMPLETED';
  saga.transactionId = transactionId;
  saga.steps.push({ type: EVENTS.PAYMENT_SUCCEEDED, timestamp: new Date(), data: content.data });
  
  console.log(`Pago exitoso para la orden: ${orderId}. Transacción: ${transactionId}`);
  
  // Confirm inventory reservation
  const inventoryService = serviceRegistry['inventory-service'];
  if (!inventoryService) {
    console.error('Servicio de inventario no registrado');
    return;
  }
  
  await messageService.publish(inventoryService.queueName, {
    type: EVENTS.INVENTORY_RESERVED,
    data: {
      orderId,
      reservationId: saga.reservationId
    }
  });
  
  // Notify order service about success
  const orderService = serviceRegistry['order-service'];
  if (!orderService) {
    console.error('Servicio de órdenes no registrado');
    return;
  }
  
  await messageService.publish(orderService.queueName, {
    type: EVENTS.ORDER_COMPLETED,
    data: {
      orderId,
      transactionId
    }
  });
}

// Handle PAYMENT_FAILED event
async function handlePaymentFailure(content) {
  const { orderId, reason } = content.data;
  const saga = sagaStore[orderId];
  
  if (!saga) {
    console.error(`Saga no encontrada para la orden: ${orderId}`);
    return;
  }
  
  // Update saga state
  saga.status = 'FAILED';
  saga.failureReason = reason;
  saga.steps.push({ type: EVENTS.PAYMENT_FAILED, timestamp: new Date(), data: content.data });
  
  console.log(`Pago fallido para la orden: ${orderId}. Razón: ${reason}`);
  
  // Release inventory reservation (compensating action)
  const inventoryService = serviceRegistry['inventory-service'];
  if (!inventoryService) {
    console.error('Servicio de inventario no registrado');
    return;
  }
  
  await messageService.publish(inventoryService.queueName, {
    type: EVENTS.INVENTORY_RELEASED,
    data: {
      orderId,
      reservationId: saga.reservationId
    }
  });
  
  // Notify order service about failure
  const orderService = serviceRegistry['order-service'];
  if (!orderService) {
    console.error('Servicio de órdenes no registrado');
    return;
  }
  
  await messageService.publish(orderService.queueName, {
    type: EVENTS.ORDER_CANCELLED,
    data: {
      orderId,
      reason
    }
  });
}

// API endpoints for saga management (for demonstration purposes)
app.get('/sagas', (req, res) => {
  res.json(Object.values(sagaStore));
});

app.get('/sagas/:id', (req, res) => {
  const saga = sagaStore[req.params.id];
  if (!saga) {
    return res.status(404).json({ error: 'Saga no encontrada' });
  }
  res.json(saga);
});

// Endpoint para ver servicios registrados
app.get('/services', (req, res) => {
  res.json(Object.values(serviceRegistry));
});

// Start server and connect to RabbitMQ
async function startServer() {
  app.listen(PORT, () => {
    console.log(`Orquestador escuchando en el puerto ${PORT}`);
  });
  
  // Registrar los servicios core
  registerCoreServices();
  
  // Cargar servicios adicionales desde la carpeta services
  await loadServices();
  
  // Configurar servicio de mensajería
  await setupMessageService();
}

startServer().catch(err => {
  console.error('Error iniciando el servidor:', err);
  process.exit(1);
});
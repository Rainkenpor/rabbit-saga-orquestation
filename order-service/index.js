const express = require('express');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const MessageService = require('../shared/MessageService');
const { QUEUES, EVENTS } = require('../shared/constants');

// Initialize express app
const app = express();
app.use(express.json());
const PORT = 3002;

// In-memory orders database (in a real app, this would be a real database)
const orders = {};

// Servicio de mensajería
const messageService = new MessageService('order-service');

async function setupMessageService() {
  try {
    // Inicializar el servicio de mensajería
    await messageService.initialize();
    
    // Crear canales necesarios
    await messageService.createQueue(QUEUES.ORDER_SERVICE);
    await messageService.createQueue(QUEUES.ORCHESTRATOR);
    
    // Suscribirse al canal de órdenes
    await messageService.subscribe(QUEUES.ORDER_SERVICE, handleMessage);
    
    console.log('Servicio de órdenes listo para procesar mensajes');
  } catch (error) {
    console.error('Error configurando servicio de mensajería:', error);
    process.exit(1);
  }
}

// Message handler for order service
async function handleMessage(content, message) {
  console.log(`Procesando mensaje: ${content.type}`);
  
  switch (content.type) {
    case EVENTS.ORDER_COMPLETED:
      await handleOrderCompleted(content);
      break;
      
    case EVENTS.ORDER_CANCELLED:
      await handleOrderCancelled(content);
      break;
      
    default:
      console.log(`Tipo de evento desconocido: ${content.type}`);
  }
  
  // Confirmar el procesamiento del mensaje
  messageService.acknowledge(message);
}

// Handle order completion
async function handleOrderCompleted(content) {
  const { orderId, transactionId } = content.data;
  const order = orders[orderId];
  
  if (!order) {
    console.error(`Orden no encontrada: ${orderId}`);
    return;
  }
  
  // Update order status
  order.status = 'COMPLETED';
  order.transactionId = transactionId;
  order.updatedAt = new Date();
  
  console.log(`Orden ${orderId} completada con transacción: ${transactionId}`);
}

// Handle order cancellation
async function handleOrderCancelled(content) {
  const { orderId, reason, insufficientItems } = content.data;
  const order = orders[orderId];
  
  if (!order) {
    console.error(`Orden no encontrada: ${orderId}`);
    return;
  }
  
  // Update order status
  order.status = 'CANCELLED';
  order.cancellationReason = reason;
  if (insufficientItems) {
    order.insufficientItems = insufficientItems;
  }
  order.updatedAt = new Date();
  
  console.log(`Orden ${orderId} cancelada. Razón: ${reason}`);
}

// API endpoints for order management
app.post('/orders', async (req, res) => {
  try {
    const { customerId, items } = req.body;
    
    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Datos de orden inválidos. Se requiere: customerId y array de items.' });
    }
    
    // Calculate total amount (simplified)
    const totalAmount = items.reduce((total, item) => total + (item.price * item.quantity), 0);
    
    // Create a new order
    const orderId = uuidv4();
    const order = {
      id: orderId,
      customerId,
      items,
      totalAmount,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Save order
    orders[orderId] = order;
    
    // Publish order created event to start the saga
    await messageService.publish(QUEUES.ORCHESTRATOR, {
      type: EVENTS.ORDER_CREATED,
      data: {
        orderId,
        customerId,
        items,
        totalAmount
      }
    });
    
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creando orden:', error);
    res.status(500).json({ error: 'Error al crear la orden' });
  }
});

app.get('/orders', (req, res) => {
  res.json(Object.values(orders));
});

app.get('/orders/:id', (req, res) => {
  const order = orders[req.params.id];
  if (!order) {
    return res.status(404).json({ error: 'Orden no encontrada' });
  }
  res.json(order);
});

// Start server and setup messaging
async function startServer() {
  app.listen(PORT, () => {
    console.log(`Servicio de órdenes escuchando en el puerto ${PORT}`);
  });
  
  await setupMessageService();
}

startServer().catch(err => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
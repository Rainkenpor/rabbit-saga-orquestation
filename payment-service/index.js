const express = require('express');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const MessageService = require('../shared/MessageService');
const { QUEUES, EVENTS } = require('../shared/constants');

// Initialize express app
const app = express();
app.use(express.json());
const PORT = 3003;

// In-memory payments database (in a real app, this would be a real database)
const payments = {};

// Simulated customer credit limits (in a real app, this would be in a database)
const customerCreditLimits = {
  'customer-1': 1000,
  'customer-2': 5000,
  'customer-3': 100
};

// Servicio de mensajería
const messageService = new MessageService('payment-service');

async function setupMessageService() {
  try {
    // Inicializar el servicio de mensajería
    await messageService.initialize();
    
    // Crear canales necesarios
    await messageService.createQueue(QUEUES.PAYMENT_SERVICE);
    await messageService.createQueue(QUEUES.ORCHESTRATOR);
    
    // Suscribirse al canal de pagos
    await messageService.subscribe(QUEUES.PAYMENT_SERVICE, handleMessage);
    
    console.log('Servicio de pagos listo para procesar mensajes');
  } catch (error) {
    console.error('Error configurando servicio de mensajería:', error);
    process.exit(1);
  }
}

// Message handler for payment service
async function handleMessage(content, message) {
  console.log(`Procesando mensaje: ${content.type}`);
  
  switch (content.type) {
    case EVENTS.PAYMENT_REQUESTED:
      await handlePaymentRequest(content);
      break;
      
    default:
      console.log(`Tipo de evento desconocido: ${content.type}`);
  }
  
  // Confirmar el procesamiento del mensaje
  messageService.acknowledge(message);
}

// Handle payment request
async function handlePaymentRequest(content) {
  const { orderId, customerId, amount } = content.data;
  
  // Check if customer exists
  const customerCreditLimit = customerCreditLimits[customerId];
  
  if (!customerCreditLimit) {
    console.log(`Cliente no encontrado: ${customerId}`);
    
    await messageService.publish(QUEUES.ORCHESTRATOR, {
      type: EVENTS.PAYMENT_FAILED,
      data: {
        orderId,
        reason: 'Cliente no encontrado'
      }
    });
    return;
  }
  
  // Check if customer has enough credit
  if (amount > customerCreditLimit) {
    console.log(`Fondos insuficientes para cliente: ${customerId}, requerido: ${amount}, límite: ${customerCreditLimit}`);
    
    await messageService.publish(QUEUES.ORCHESTRATOR, {
      type: EVENTS.PAYMENT_FAILED,
      data: {
        orderId,
        reason: 'Fondos insuficientes',
        details: {
          required: amount,
          available: customerCreditLimit
        }
      }
    });
    return;
  }
  
  // Process payment (in a real system, this would involve a payment gateway)
  const transactionId = uuidv4();
  
  // Record payment
  payments[transactionId] = {
    id: transactionId,
    orderId,
    customerId,
    amount,
    status: 'COMPLETED',
    timestamp: new Date()
  };
  
  console.log(`Pago procesado para orden: ${orderId}, monto: ${amount}, transacción: ${transactionId}`);
  
  // Notify orchestrator about success
  await messageService.publish(QUEUES.ORCHESTRATOR, {
    type: EVENTS.PAYMENT_SUCCEEDED,
    data: {
      orderId,
      transactionId,
      amount
    }
  });
}

// API endpoints for payment management (for demonstration purposes)
app.get('/payments', (req, res) => {
  res.json(Object.values(payments));
});

app.get('/payments/:id', (req, res) => {
  const payment = payments[req.params.id];
  if (!payment) {
    return res.status(404).json({ error: 'Pago no encontrado' });
  }
  res.json(payment);
});

// Start server and setup messaging
async function startServer() {
  app.listen(PORT, () => {
    console.log(`Servicio de pagos escuchando en el puerto ${PORT}`);
  });
  
  await setupMessageService();
}

startServer().catch(err => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
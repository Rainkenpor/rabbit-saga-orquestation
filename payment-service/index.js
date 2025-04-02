const express = require('express');
const { v4: uuidv4 } = require('uuid');
const RabbitMQClient = require('../shared/rabbitmq');
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

// RabbitMQ setup
const rabbitMQClient = new RabbitMQClient();

async function setupRabbitMQ() {
  try {
    await rabbitMQClient.connect();
    await rabbitMQClient.createQueue(QUEUES.PAYMENT_SERVICE);
    await rabbitMQClient.createQueue(QUEUES.ORCHESTRATOR);
    
    // Setup consumer for payment service queue
    await rabbitMQClient.consumeMessages(QUEUES.PAYMENT_SERVICE, handleMessage);
    
    console.log('Payment service is ready to process messages');
  } catch (error) {
    console.error('Failed to setup RabbitMQ:', error);
    process.exit(1);
  }
}

// Message handler for payment service
async function handleMessage(content, message) {
  console.log(`Processing message: ${content.type}`);
  
  switch (content.type) {
    case EVENTS.PAYMENT_REQUESTED:
      await handlePaymentRequest(content);
      break;
      
    default:
      console.log(`Unknown event type: ${content.type}`);
  }
  
  // Acknowledge the message
  rabbitMQClient.acknowledgeMessage(message);
}

// Handle payment request
async function handlePaymentRequest(content) {
  const { orderId, customerId, amount } = content.data;
  
  // Check if customer exists
  const customerCreditLimit = customerCreditLimits[customerId];
  
  if (!customerCreditLimit) {
    console.log(`Customer not found: ${customerId}`);
    
    await rabbitMQClient.publishMessage(QUEUES.ORCHESTRATOR, {
      type: EVENTS.PAYMENT_FAILED,
      data: {
        orderId,
        reason: 'Customer not found'
      }
    });
    return;
  }
  
  // Check if customer has enough credit
  if (amount > customerCreditLimit) {
    console.log(`Insufficient funds for customer: ${customerId}, needed: ${amount}, limit: ${customerCreditLimit}`);
    
    await rabbitMQClient.publishMessage(QUEUES.ORCHESTRATOR, {
      type: EVENTS.PAYMENT_FAILED,
      data: {
        orderId,
        reason: 'Insufficient funds',
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
  
  console.log(`Payment processed for order: ${orderId}, amount: ${amount}, transaction: ${transactionId}`);
  
  // Notify orchestrator about success
  await rabbitMQClient.publishMessage(QUEUES.ORCHESTRATOR, {
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
    return res.status(404).json({ error: 'Payment not found' });
  }
  res.json(payment);
});

// Start server and connect to RabbitMQ
async function startServer() {
  app.listen(PORT, () => {
    console.log(`Payment service listening on port ${PORT}`);
  });
  
  await setupRabbitMQ();
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
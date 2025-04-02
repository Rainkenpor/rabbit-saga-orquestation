const express = require('express');
const { v4: uuidv4 } = require('uuid');
const RabbitMQClient = require('../shared/rabbitmq');
const { QUEUES, EVENTS } = require('../shared/constants');

// Initialize express app
const app = express();
app.use(express.json());
const PORT = 3002;

// In-memory orders database (in a real app, this would be a real database)
const orders = {};

// RabbitMQ setup
const rabbitMQClient = new RabbitMQClient();

async function setupRabbitMQ() {
  try {
    await rabbitMQClient.connect();
    await rabbitMQClient.createQueue(QUEUES.ORDER_SERVICE);
    await rabbitMQClient.createQueue(QUEUES.ORCHESTRATOR);
    
    // Setup consumer for order service queue
    await rabbitMQClient.consumeMessages(QUEUES.ORDER_SERVICE, handleMessage);
    
    console.log('Order service is ready to process messages');
  } catch (error) {
    console.error('Failed to setup RabbitMQ:', error);
    process.exit(1);
  }
}

// Message handler for order service
async function handleMessage(content, message) {
  console.log(`Processing message: ${content.type}`);
  
  switch (content.type) {
    case EVENTS.ORDER_COMPLETED:
      await handleOrderCompleted(content);
      break;
      
    case EVENTS.ORDER_CANCELLED:
      await handleOrderCancelled(content);
      break;
      
    default:
      console.log(`Unknown event type: ${content.type}`);
  }
  
  // Acknowledge the message
  rabbitMQClient.acknowledgeMessage(message);
}

// Handle order completion
async function handleOrderCompleted(content) {
  const { orderId, transactionId } = content.data;
  const order = orders[orderId];
  
  if (!order) {
    console.error(`Order not found: ${orderId}`);
    return;
  }
  
  // Update order status
  order.status = 'COMPLETED';
  order.transactionId = transactionId;
  order.updatedAt = new Date();
  
  console.log(`Order ${orderId} completed with transaction: ${transactionId}`);
}

// Handle order cancellation
async function handleOrderCancelled(content) {
  const { orderId, reason, insufficientItems } = content.data;
  const order = orders[orderId];
  
  if (!order) {
    console.error(`Order not found: ${orderId}`);
    return;
  }
  
  // Update order status
  order.status = 'CANCELLED';
  order.cancellationReason = reason;
  if (insufficientItems) {
    order.insufficientItems = insufficientItems;
  }
  order.updatedAt = new Date();
  
  console.log(`Order ${orderId} cancelled. Reason: ${reason}`);
}

// API endpoints for order management
app.post('/orders', async (req, res) => {
  try {
    const { customerId, items } = req.body;
    
    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid order data. Required: customerId and items array.' });
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
    await rabbitMQClient.publishMessage(QUEUES.ORCHESTRATOR, {
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
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.get('/orders', (req, res) => {
  res.json(Object.values(orders));
});

app.get('/orders/:id', (req, res) => {
  const order = orders[req.params.id];
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json(order);
});

// Start server and connect to RabbitMQ
async function startServer() {
  app.listen(PORT, () => {
    console.log(`Order service listening on port ${PORT}`);
  });
  
  await setupRabbitMQ();
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
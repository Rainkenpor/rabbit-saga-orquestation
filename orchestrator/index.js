const express = require('express');
const { v4: uuidv4 } = require('uuid');
const RabbitMQClient = require('../shared/rabbitmq');
const { QUEUES, EVENTS } = require('../shared/constants');

// Initialize express app
const app = express();
app.use(express.json());
const PORT = 3000;

// Store for tracking saga state
const sagaStore = {};

// RabbitMQ setup
const rabbitMQClient = new RabbitMQClient();

async function setupRabbitMQ() {
  try {
    await rabbitMQClient.connect();
    await rabbitMQClient.createQueue(QUEUES.ORCHESTRATOR);
    await rabbitMQClient.createQueue(QUEUES.ORDER_SERVICE);
    await rabbitMQClient.createQueue(QUEUES.INVENTORY_SERVICE);
    await rabbitMQClient.createQueue(QUEUES.PAYMENT_SERVICE);
    
    // Setup consumer for orchestrator queue
    await rabbitMQClient.consumeMessages(QUEUES.ORCHESTRATOR, handleMessage);
    
    console.log('Orchestrator is ready to process messages');
  } catch (error) {
    console.error('Failed to setup RabbitMQ:', error);
    process.exit(1);
  }
}

// Message handler for orchestrator
async function handleMessage(content, message) {
  console.log(`Orchestrator processing message: ${content.type}`);
  
  switch (content.type) {
    case EVENTS.ORDER_CREATED:
      await handleOrderCreated(content);
      break;
      
    case EVENTS.INVENTORY_CHECK_SUCCEEDED:
      await handleInventoryCheckSuccess(content);
      break;
      
    case EVENTS.INVENTORY_CHECK_FAILED:
      await handleInventoryCheckFailure(content);
      break;
      
    case EVENTS.PAYMENT_SUCCEEDED:
      await handlePaymentSuccess(content);
      break;
      
    case EVENTS.PAYMENT_FAILED:
      await handlePaymentFailure(content);
      break;
      
    default:
      console.log(`Unknown event type: ${content.type}`);
  }
  
  // Acknowledge the message
  rabbitMQClient.acknowledgeMessage(message);
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
  
  console.log(`Starting saga for order: ${orderId}`);
  
  // Request inventory check
  await rabbitMQClient.publishMessage(QUEUES.INVENTORY_SERVICE, {
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
    console.error(`Saga not found for order: ${orderId}`);
    return;
  }
  
  // Update saga state
  saga.status = 'PAYMENT_PENDING';
  saga.reservationId = reservationId;
  saga.steps.push({ type: EVENTS.INVENTORY_CHECK_SUCCEEDED, timestamp: new Date(), data: content.data });
  
  console.log(`Inventory check succeeded for order: ${orderId}. Proceeding to payment.`);
  
  // Request payment
  await rabbitMQClient.publishMessage(QUEUES.PAYMENT_SERVICE, {
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
    console.error(`Saga not found for order: ${orderId}`);
    return;
  }
  
  // Update saga state
  saga.status = 'FAILED';
  saga.failureReason = reason;
  saga.insufficientItems = insufficientItems;
  saga.steps.push({ type: EVENTS.INVENTORY_CHECK_FAILED, timestamp: new Date(), data: content.data });
  
  console.log(`Inventory check failed for order: ${orderId}. Reason: ${reason}`);
  
  // Notify order service about failure
  await rabbitMQClient.publishMessage(QUEUES.ORDER_SERVICE, {
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
    console.error(`Saga not found for order: ${orderId}`);
    return;
  }
  
  // Update saga state
  saga.status = 'COMPLETED';
  saga.transactionId = transactionId;
  saga.steps.push({ type: EVENTS.PAYMENT_SUCCEEDED, timestamp: new Date(), data: content.data });
  
  console.log(`Payment succeeded for order: ${orderId}. Transaction: ${transactionId}`);
  
  // Confirm inventory reservation
  await rabbitMQClient.publishMessage(QUEUES.INVENTORY_SERVICE, {
    type: EVENTS.INVENTORY_RESERVED,
    data: {
      orderId,
      reservationId: saga.reservationId
    }
  });
  
  // Notify order service about success
  await rabbitMQClient.publishMessage(QUEUES.ORDER_SERVICE, {
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
    console.error(`Saga not found for order: ${orderId}`);
    return;
  }
  
  // Update saga state
  saga.status = 'FAILED';
  saga.failureReason = reason;
  saga.steps.push({ type: EVENTS.PAYMENT_FAILED, timestamp: new Date(), data: content.data });
  
  console.log(`Payment failed for order: ${orderId}. Reason: ${reason}`);
  
  // Release inventory reservation (compensating action)
  await rabbitMQClient.publishMessage(QUEUES.INVENTORY_SERVICE, {
    type: EVENTS.INVENTORY_RELEASED,
    data: {
      orderId,
      reservationId: saga.reservationId
    }
  });
  
  // Notify order service about failure
  await rabbitMQClient.publishMessage(QUEUES.ORDER_SERVICE, {
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
    return res.status(404).json({ error: 'Saga not found' });
  }
  res.json(saga);
});

// Start server and connect to RabbitMQ
async function startServer() {
  app.listen(PORT, () => {
    console.log(`Orchestrator service listening on port ${PORT}`);
  });
  
  await setupRabbitMQ();
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
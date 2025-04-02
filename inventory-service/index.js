const express = require('express');
const RabbitMQClient = require('../shared/rabbitmq');
const { QUEUES, EVENTS } = require('../shared/constants');

// Initialize express app
const app = express();
app.use(express.json());
const PORT = 3001;

// In-memory inventory database (in a real app, this would be a real database)
const inventoryItems = {
  'item-1': { id: 'item-1', name: 'Product 1', stock: 10 },
  'item-2': { id: 'item-2', name: 'Product 2', stock: 5 },
  'item-3': { id: 'item-3', name: 'Product 3', stock: 0 }
};

// Map to keep track of temporary reservations
const reservations = {};

// RabbitMQ setup
const rabbitMQClient = new RabbitMQClient();

async function setupRabbitMQ() {
  try {
    await rabbitMQClient.connect();
    await rabbitMQClient.createQueue(QUEUES.INVENTORY_SERVICE);
    await rabbitMQClient.createQueue(QUEUES.ORCHESTRATOR);
    
    // Setup consumer for inventory service queue
    await rabbitMQClient.consumeMessages(QUEUES.INVENTORY_SERVICE, handleMessage);
    
    console.log('Inventory service is ready to process messages');
  } catch (error) {
    console.error('Failed to setup RabbitMQ:', error);
    process.exit(1);
  }
}

// Message handler for inventory service
async function handleMessage(content, message) {
  console.log(`Processing message: ${content.type}`);
  
  switch (content.type) {
    case EVENTS.INVENTORY_CHECK_REQUESTED:
      await handleInventoryCheckRequest(content);
      break;
      
    case EVENTS.INVENTORY_RESERVED:
      await handleInventoryReservation(content);
      break;
      
    case EVENTS.INVENTORY_RELEASED:
      await handleInventoryRelease(content);
      break;
      
    default:
      console.log(`Unknown event type: ${content.type}`);
  }
  
  // Acknowledge the message
  rabbitMQClient.acknowledgeMessage(message);
}

// Handle inventory check request
async function handleInventoryCheckRequest(content) {
  const { orderId, items } = content.data;
  let isAvailable = true;
  const insufficientItems = [];
  
  // Check if all items are available in required quantities
  for (const item of items) {
    const inventoryItem = inventoryItems[item.id];
    
    if (!inventoryItem || inventoryItem.stock < item.quantity) {
      isAvailable = false;
      insufficientItems.push({
        id: item.id,
        requested: item.quantity,
        available: inventoryItem ? inventoryItem.stock : 0
      });
    }
  }
  
  // Send response to orchestrator
  if (isAvailable) {
    // If available, create temporary reservation
    const reservationId = `reservation-${orderId}`;
    reservations[reservationId] = {
      orderId,
      items: items.map(item => ({...item})),
      status: 'pending'
    };
    
    await rabbitMQClient.publishMessage(QUEUES.ORCHESTRATOR, {
      type: EVENTS.INVENTORY_CHECK_SUCCEEDED,
      data: {
        orderId,
        reservationId
      }
    });
  } else {
    await rabbitMQClient.publishMessage(QUEUES.ORCHESTRATOR, {
      type: EVENTS.INVENTORY_CHECK_FAILED,
      data: {
        orderId,
        reason: 'Insufficient inventory',
        insufficientItems
      }
    });
  }
}

// Handle inventory reservation (commit)
async function handleInventoryReservation(content) {
  const { orderId, reservationId } = content.data;
  const reservation = reservations[reservationId];
  
  if (!reservation) {
    console.error(`Reservation not found: ${reservationId}`);
    return;
  }
  
  // Commit the reservation by updating actual inventory
  for (const item of reservation.items) {
    inventoryItems[item.id].stock -= item.quantity;
  }
  
  // Update reservation status
  reservation.status = 'confirmed';
  
  console.log(`Inventory reserved for order ${orderId}`);
}

// Handle inventory release (rollback)
async function handleInventoryRelease(content) {
  const { orderId, reservationId } = content.data;
  const reservation = reservations[reservationId];
  
  if (!reservation) {
    console.error(`Reservation not found: ${reservationId}`);
    return;
  }
  
  // Delete the reservation
  delete reservations[reservationId];
  
  console.log(`Inventory reservation released for order ${orderId}`);
}

// API endpoints for inventory management (for demonstration purposes)
app.get('/inventory', (req, res) => {
  res.json(Object.values(inventoryItems));
});

app.get('/inventory/:id', (req, res) => {
  const item = inventoryItems[req.params.id];
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  res.json(item);
});

app.get('/reservations', (req, res) => {
  res.json(reservations);
});

// Start server and connect to RabbitMQ
async function startServer() {
  app.listen(PORT, () => {
    console.log(`Inventory service listening on port ${PORT}`);
  });
  
  await setupRabbitMQ();
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
const express = require('express');
require('dotenv').config();
const MessageService = require('../shared/MessageService');
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

// Servicio de mensajería
const messageService = new MessageService('inventory-service');

async function setupMessageService() {
  try {
    // Inicializar el servicio de mensajería
    await messageService.initialize();
    
    // Crear canales necesarios
    await messageService.createQueue(QUEUES.INVENTORY_SERVICE);
    await messageService.createQueue(QUEUES.ORCHESTRATOR);
    
    // Suscribirse al canal de inventario
    await messageService.subscribe(QUEUES.INVENTORY_SERVICE, handleMessage);
    
    console.log('Servicio de inventario listo para procesar mensajes');
  } catch (error) {
    console.error('Error configurando servicio de mensajería:', error);
    process.exit(1);
  }
}

// Message handler for inventory service
async function handleMessage(content, message) {
  console.log(`Procesando mensaje: ${content.type}`);
  
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
      console.log(`Tipo de evento desconocido: ${content.type}`);
  }
  
  // Confirmar el procesamiento del mensaje
  messageService.acknowledge(message);
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
    
    await messageService.publish(QUEUES.ORCHESTRATOR, {
      type: EVENTS.INVENTORY_CHECK_SUCCEEDED,
      data: {
        orderId,
        reservationId
      }
    });
  } else {
    await messageService.publish(QUEUES.ORCHESTRATOR, {
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

// Start server and setup messaging
async function startServer() {
  app.listen(PORT, () => {
    console.log(`Inventory service listening on port ${PORT}`);
  });
  
  await setupMessageService();
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
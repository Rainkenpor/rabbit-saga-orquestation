/**
 * Servicio de Inventario para el Orquestador de Sagas
 * Este módulo contiene la lógica específica para manejar eventos relacionados con el inventario
 */

const { EVENTS } = require('../../shared/constants');
const { inventoryServiceContract } = require('../../shared/contracts');

/**
 * Contrato que define cómo interactúa este servicio con el orquestador
 */
const contract = inventoryServiceContract;

/**
 * Maneja la verificación de disponibilidad de inventario
 * @param {Object} data - Datos de la solicitud
 * @param {Object} sagaContext - Contexto actual de la saga
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function handleInventoryCheck(data, sagaContext) {
  const { orderId, items } = data;
  
  // En una implementación real, aquí se comunicaría con el servicio de inventario
  // a través de su API o directamente con la base de datos
  
  console.log(`[Servicio Inventario] Verificando disponibilidad para orden: ${orderId}`);
  
  // Aquí iría la lógica para verificar el inventario
  // Por ahora usamos una lógica simulada:
  const insufficientItems = [];
  let isAvailable = true;
  
  // Lógica de ejemplo para decidir si hay inventario disponible
  const hasItem3 = items.some(item => item.id === 'item-3');
  if (hasItem3) {
    isAvailable = false;
    insufficientItems.push({
      id: 'item-3',
      requested: items.find(item => item.id === 'item-3').quantity,
      available: 0
    });
  }
  
  if (isAvailable) {
    return {
      success: true,
      event: EVENTS.INVENTORY_CHECK_SUCCEEDED,
      data: {
        orderId,
        reservationId: `reservation-${orderId}`
      }
    };
  } else {
    return {
      success: false,
      event: EVENTS.INVENTORY_CHECK_FAILED,
      data: {
        orderId,
        reason: 'Insufficient inventory',
        insufficientItems
      }
    };
  }
}

/**
 * Maneja la confirmación de la reserva de inventario
 * @param {Object} data - Datos de la solicitud
 * @param {Object} sagaContext - Contexto actual de la saga
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function handleInventoryReservation(data, sagaContext) {
  const { orderId, reservationId } = data;
  
  console.log(`[Servicio Inventario] Confirmando reserva para orden: ${orderId}`);
  
  // Aquí iría la lógica para confirmar la reserva de inventario
  
  return {
    success: true,
    data: {
      orderId,
      reservationId,
      message: 'Inventory successfully reserved'
    }
  };
}

/**
 * Maneja la liberación de la reserva de inventario (compensación)
 * @param {Object} data - Datos de la solicitud
 * @param {Object} sagaContext - Contexto actual de la saga
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function handleInventoryRelease(data, sagaContext) {
  const { orderId, reservationId } = data;
  
  console.log(`[Servicio Inventario] Liberando reserva para orden: ${orderId}`);
  
  // Aquí iría la lógica para liberar la reserva
  
  return {
    success: true,
    data: {
      orderId,
      reservationId,
      message: 'Inventory reservation released'
    }
  };
}

// Mapa de manejadores para distintos tipos de eventos
const handlers = {
  [EVENTS.INVENTORY_CHECK_REQUESTED]: handleInventoryCheck,
  [EVENTS.INVENTORY_RESERVED]: handleInventoryReservation,
  [EVENTS.INVENTORY_RELEASED]: handleInventoryRelease
};

/**
 * Procesa un evento para este servicio
 * @param {Object} event - Evento a procesar
 * @param {Object} sagaContext - Contexto actual de la saga
 * @returns {Promise<Object>} - Resultado del procesamiento
 */
async function processEvent(event, sagaContext) {
  const handler = handlers[event.type];
  
  if (!handler) {
    throw new Error(`No hay manejador para el evento: ${event.type} en el servicio de inventario`);
  }
  
  return await handler(event.data, sagaContext);
}

module.exports = {
  contract,
  processEvent,
  handlers
};
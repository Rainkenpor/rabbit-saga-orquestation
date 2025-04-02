/**
 * Servicio de Órdenes para el Orquestador de Sagas
 * Este módulo contiene la lógica específica para manejar eventos relacionados con órdenes
 */

const { EVENTS } = require('../../shared/constants');
const { orderServiceContract } = require('../../shared/contracts');

/**
 * Contrato que define cómo interactúa este servicio con el orquestador
 */
const contract = orderServiceContract;

/**
 * Maneja la creación de una orden nueva
 * @param {Object} data - Datos de la orden
 * @param {Object} sagaContext - Contexto actual de la saga
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function handleOrderCreated(data, sagaContext) {
  const { orderId, customerId, items, totalAmount } = data;
  
  console.log(`[Servicio Órdenes] Nueva orden creada: ${orderId}, cliente: ${customerId}, total: ${totalAmount}`);
  
  // Aquí se iniciaría la saga registrando la nueva orden
  return {
    success: true,
    data: {
      orderId,
      customerId,
      items,
      totalAmount,
      createdAt: new Date()
    }
  };
}

/**
 * Maneja la finalización exitosa de una orden
 * @param {Object} data - Datos de finalización
 * @param {Object} sagaContext - Contexto actual de la saga
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function handleOrderCompleted(data, sagaContext) {
  const { orderId, transactionId } = data;
  
  console.log(`[Servicio Órdenes] Orden completada: ${orderId}, transacción: ${transactionId}`);
  
  // Aquí se actualizaría el estado de la orden a COMPLETADA
  return {
    success: true,
    data: {
      orderId,
      status: 'COMPLETED',
      transactionId,
      completedAt: new Date()
    }
  };
}

/**
 * Maneja la cancelación de una orden
 * @param {Object} data - Datos de cancelación
 * @param {Object} sagaContext - Contexto actual de la saga
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function handleOrderCancelled(data, sagaContext) {
  const { orderId, reason, insufficientItems } = data;
  
  console.log(`[Servicio Órdenes] Orden cancelada: ${orderId}, razón: ${reason}`);
  
  // Aquí se actualizaría el estado de la orden a CANCELADA
  return {
    success: true,
    data: {
      orderId,
      status: 'CANCELLED',
      reason,
      insufficientItems,
      cancelledAt: new Date()
    }
  };
}

// Mapa de manejadores para distintos tipos de eventos
const handlers = {
  [EVENTS.ORDER_CREATED]: handleOrderCreated,
  [EVENTS.ORDER_COMPLETED]: handleOrderCompleted,
  [EVENTS.ORDER_CANCELLED]: handleOrderCancelled
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
    throw new Error(`No hay manejador para el evento: ${event.type} en el servicio de órdenes`);
  }
  
  return await handler(event.data, sagaContext);
}

module.exports = {
  contract,
  processEvent,
  handlers
};
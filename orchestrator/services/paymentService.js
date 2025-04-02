/**
 * Servicio de Pagos para el Orquestador de Sagas
 * Este módulo contiene la lógica específica para manejar eventos relacionados con pagos
 */

const { EVENTS } = require('../../shared/constants');
const { paymentServiceContract } = require('../../shared/contracts');

/**
 * Contrato que define cómo interactúa este servicio con el orquestador
 */
const contract = paymentServiceContract;

/**
 * Maneja la solicitud de pago
 * @param {Object} data - Datos de la solicitud
 * @param {Object} sagaContext - Contexto actual de la saga
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function handlePaymentRequest(data, sagaContext) {
  const { orderId, customerId, amount } = data;
  
  // En una implementación real, aquí se comunicaría con el servicio de pagos
  // a través de su API o directamente con la pasarela de pago
  
  console.log(`[Servicio Pagos] Procesando pago para orden: ${orderId}, cliente: ${customerId}, monto: ${amount}`);
  
  // Simulamos lógica de pagos basada en el ID del cliente y el monto
  // customer-1: tiene límite de 1000
  // customer-2: tiene límite de 5000
  // customer-3: tiene límite de 100
  
  const customerLimits = {
    'customer-1': 1000,
    'customer-2': 5000,
    'customer-3': 100
  };
  
  const customerLimit = customerLimits[customerId];
  
  if (!customerLimit) {
    return {
      success: false,
      event: EVENTS.PAYMENT_FAILED,
      data: {
        orderId,
        reason: 'Cliente no encontrado',
        details: { customerId }
      }
    };
  }
  
  if (amount > customerLimit) {
    return {
      success: false,
      event: EVENTS.PAYMENT_FAILED,
      data: {
        orderId,
        reason: 'Fondos insuficientes',
        details: {
          required: amount,
          available: customerLimit
        }
      }
    };
  }
  
  // Si llegamos aquí, el pago fue exitoso
  return {
    success: true,
    event: EVENTS.PAYMENT_SUCCEEDED,
    data: {
      orderId,
      transactionId: `tx-${Date.now()}-${orderId}`,
      amount
    }
  };
}

// Mapa de manejadores para distintos tipos de eventos
const handlers = {
  [EVENTS.PAYMENT_REQUESTED]: handlePaymentRequest
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
    throw new Error(`No hay manejador para el evento: ${event.type} en el servicio de pagos`);
  }
  
  return await handler(event.data, sagaContext);
}

module.exports = {
  contract,
  processEvent,
  handlers
};
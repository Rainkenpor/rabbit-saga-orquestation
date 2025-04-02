/**
 * Este archivo define los contratos que cada microservicio debe implementar
 * para integrarse correctamente con el orquestador de sagas
 */

/**
 * Estructura básica que un microservicio debe proporcionar al registrarse
 * @typedef {Object} ServiceContract
 * @property {string} name - Nombre único del servicio
 * @property {string} queueName - Nombre de la cola de RabbitMQ para este servicio
 * @property {Array<string>} handles - Lista de eventos que este servicio puede manejar
 * @property {Array<string>} produces - Lista de eventos que este servicio puede producir
 * @property {Object} schema - Esquema de validación para los mensajes entrantes y salientes
 * @property {Object} compensations - Mapeo de eventos a sus compensaciones
 */

/**
 * Ejemplo de contrato para un microservicio
 */
const exampleServiceContract = {
  name: 'example-service',
  queueName: 'example_service_queue',
  handles: ['EVENT_NAME_1', 'EVENT_NAME_2'],
  produces: ['EVENT_RESULT_1', 'EVENT_RESULT_2'],
  schema: {
    EVENT_NAME_1: {
      // Schema para validación de datos de entrada
      input: {
        type: 'object',
        required: ['id', 'data'],
        properties: {
          id: { type: 'string' },
          data: { type: 'object' }
        }
      },
      // Schema para validación de datos de salida
      output: {
        type: 'object',
        required: ['success', 'result'],
        properties: {
          success: { type: 'boolean' },
          result: { type: 'object' }
        }
      }
    }
  },
  // Mapeo de eventos a sus compensaciones correspondientes
  compensations: {
    'EVENT_RESULT_1': 'COMPENSATION_EVENT_1'
  }
};

/**
 * Contrato del Servicio de Inventario
 */
const inventoryServiceContract = {
  name: 'inventory-service',
  queueName: 'inventory_service_queue',
  handles: ['INVENTORY_CHECK_REQUESTED', 'INVENTORY_RESERVED', 'INVENTORY_RELEASED'],
  produces: ['INVENTORY_CHECK_SUCCEEDED', 'INVENTORY_CHECK_FAILED'],
  schema: {
    INVENTORY_CHECK_REQUESTED: {
      input: {
        type: 'object',
        required: ['orderId', 'items'],
        properties: {
          orderId: { type: 'string' },
          items: { 
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'quantity'],
              properties: {
                id: { type: 'string' },
                quantity: { type: 'number' }
              }
            }
          }
        }
      },
      output: {
        type: 'object',
        required: ['success'],
        properties: {
          success: { type: 'boolean' },
          reservationId: { type: 'string' },
          reason: { type: 'string' },
          insufficientItems: { type: 'array' }
        }
      }
    }
  },
  compensations: {
    'INVENTORY_CHECK_SUCCEEDED': 'INVENTORY_RELEASED'
  }
};

/**
 * Contrato del Servicio de Pagos
 */
const paymentServiceContract = {
  name: 'payment-service',
  queueName: 'payment_service_queue',
  handles: ['PAYMENT_REQUESTED'],
  produces: ['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED'],
  schema: {
    PAYMENT_REQUESTED: {
      input: {
        type: 'object',
        required: ['orderId', 'customerId', 'amount'],
        properties: {
          orderId: { type: 'string' },
          customerId: { type: 'string' },
          amount: { type: 'number' }
        }
      },
      output: {
        type: 'object',
        required: ['success'],
        properties: {
          success: { type: 'boolean' },
          transactionId: { type: 'string' },
          reason: { type: 'string' }
        }
      }
    }
  },
  compensations: {}
};

/**
 * Contrato del Servicio de Órdenes
 */
const orderServiceContract = {
  name: 'order-service',
  queueName: 'order_service_queue',
  handles: ['ORDER_COMPLETED', 'ORDER_CANCELLED'],
  produces: ['ORDER_CREATED'],
  schema: {
    ORDER_CREATED: {
      output: {
        type: 'object',
        required: ['orderId', 'customerId', 'items', 'totalAmount'],
        properties: {
          orderId: { type: 'string' },
          customerId: { type: 'string' },
          items: { type: 'array' },
          totalAmount: { type: 'number' }
        }
      }
    }
  },
  compensations: {}
};

module.exports = {
  exampleServiceContract,
  inventoryServiceContract,
  paymentServiceContract,
  orderServiceContract
};
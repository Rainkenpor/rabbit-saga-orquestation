/**
 * Interfaz abstracta para implementaciones de transporte de mensajes.
 * Cada transporte debe implementar estos métodos para ser compatible
 * con el sistema de mensajería.
 */
class TransportInterface {
  /**
   * Establece la configuración del transporte
   * @param {Object} options - Opciones de configuración
   */
  setConfig(options) {
    throw new Error('El método setConfig debe ser implementado por la clase concreta');
  }

  /**
   * Inicializa el transporte
   * @param {string} serviceName - Nombre del servicio que utiliza este transporte
   * @returns {Promise<boolean>} - true si la inicialización fue exitosa
   */
  async initialize(serviceName) {
    throw new Error('El método initialize debe ser implementado por la clase concreta');
  }

  /**
   * Crea una cola/canal si es necesario
   * @param {string} queueName - Nombre de la cola/canal
   * @returns {Promise<void>}
   */
  async createQueue(queueName) {
    throw new Error('El método createQueue debe ser implementado por la clase concreta');
  }

  /**
   * Publica un mensaje en una cola/canal específico
   * @param {string} queueName - Nombre de la cola/canal
   * @param {Object} message - Mensaje a publicar
   * @returns {Promise<void>}
   */
  async publish(queueName, message) {
    throw new Error('El método publish debe ser implementado por la clase concreta');
  }

  /**
   * Suscribe a una cola/canal para recibir mensajes
   * @param {string} queueName - Nombre de la cola/canal
   * @param {Function} handler - Función callback para procesar mensajes
   * @returns {Promise<void>}
   */
  async subscribe(queueName, handler) {
    throw new Error('El método subscribe debe ser implementado por la clase concreta');
  }

  /**
   * Confirma el procesamiento de un mensaje
   * @param {Object} message - Mensaje a confirmar
   * @returns {Promise<void>}
   */
  async acknowledge(message) {
    throw new Error('El método acknowledge debe ser implementado por la clase concreta');
  }

  /**
   * Cierra las conexiones del transporte
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('El método close debe ser implementado por la clase concreta');
  }
}

module.exports = TransportInterface;
require('dotenv').config();
const TransportFactory = require('./transport/TransportFactory');
const { QUEUES } = require('./constants');

/**
 * Servicio de mensajería que abstrae el transporte utilizado
 */
class MessageService {
  /**
   * @param {string} serviceName - Nombre del servicio actual
   */
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.transport = TransportFactory.createTransport(serviceName);
    this.initialized = false;
  }

  /**
   * Inicializa el servicio de mensajería
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Inicializar el transporte con el nombre del servicio
      await this.transport.initialize(this.serviceName);
      this.initialized = true;
      console.log(`Servicio de mensajería inicializado para ${this.serviceName}`);
    } catch (error) {
      console.error(`Error inicializando servicio de mensajería para ${this.serviceName}:`, error);
      throw error;
    }
  }

  /**
   * Crea una cola/canal si es necesario
   * @param {string} queueName - Nombre de la cola/canal
   */
  async createQueue(queueName) {
    await this.ensureInitialized();

    // Si el transporte es RabbitMQ y tiene método createQueue, llamarlo
    if (this.transport.createQueue) {
      await this.transport.createQueue(queueName);
    }
  }

  /**
   * Se asegura de que el servicio esté inicializado antes de usarlo
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Publica un mensaje en una cola/canal específico
   * @param {string} queueName - Nombre de la cola/canal
   * @param {Object} message - Mensaje a publicar
   */
  async publish(queueName, message) {
    await this.ensureInitialized();
    await this.transport.publish(queueName, message);
  }

  /**
   * Suscribe a una cola/canal para recibir mensajes
   * @param {string} queueName - Nombre de la cola/canal
   * @param {Function} handler - Función callback para procesar mensajes
   */
  async subscribe(queueName, handler) {
    await this.ensureInitialized();
    await this.transport.subscribe(queueName, handler);
  }

  /**
   * Confirma el procesamiento de un mensaje
   * @param {Object} message - Mensaje a confirmar
   */
  async acknowledge(message) {
    if (this.transport.acknowledge) {
      await this.transport.acknowledge(message);
    }
  }

  /**
   * Cierra las conexiones del servicio de mensajería
   */
  async close() {
    if (this.initialized) {
      await this.transport.close();
      this.initialized = false;
    }
  }
}

module.exports = MessageService;
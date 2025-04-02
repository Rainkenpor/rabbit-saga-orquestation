const amqp = require('amqplib');
const TransportInterface = require('./TransportInterface');

/**
 * Implementación de transporte usando RabbitMQ
 */
class RabbitMQTransport extends TransportInterface {
  constructor() {
    super();
    this.connection = null;
    this.channel = null;
    this.config = {
      url: process.env.RABBITMQ_URL || 'amqp://localhost',
      exchange: process.env.RABBITMQ_EXCHANGE || 'saga_exchange'
    };
  }

  /**
   * Establece la configuración para la conexión de RabbitMQ
   * @param {Object} options - Opciones de configuración
   */
  setConfig(options) {
    this.config = { ...this.config, ...options };
  }

  /**
   * Inicializa la conexión con RabbitMQ
   */
  async initialize() {
    try {
      this.connection = await amqp.connect(this.config.url);
      this.channel = await this.connection.createChannel();
      
      // Crear un exchange para el modo publish/subscribe si está configurado
      if (this.config.exchange) {
        await this.channel.assertExchange(this.config.exchange, 'topic', { durable: true });
      }
      
      console.log('Conectado a RabbitMQ');
    } catch (error) {
      console.error('Error conectando a RabbitMQ:', error);
      throw error;
    }
  }

  /**
   * Crea una cola y la bindea al exchange si está configurado
   * @param {string} queue - Nombre de la cola
   * @param {string} routingKey - Clave de enrutamiento (opcional, por defecto usa el nombre de la cola)
   */
  async createQueue(queue, routingKey = queue) {
    try {
      await this.channel.assertQueue(queue, { durable: true });
      
      // Si hay un exchange configurado, bindear la cola
      if (this.config.exchange) {
        await this.channel.bindQueue(queue, this.config.exchange, routingKey);
      }
      
      console.log(`Cola ${queue} creada o confirmada`);
    } catch (error) {
      console.error(`Error creando cola ${queue}:`, error);
      throw error;
    }
  }

  /**
   * Publica un mensaje en una cola o exchange
   * @param {string} channel - Nombre de la cola o routing key para el exchange
   * @param {Object} message - Mensaje a publicar
   */
  async publish(channel, message) {
    try {
      const content = Buffer.from(JSON.stringify(message));
      
      if (this.config.exchange) {
        // Publicar en el exchange usando el canal como routing key
        await this.channel.publish(
          this.config.exchange,
          channel,
          content,
          { persistent: true }
        );
      } else {
        // Publicar directamente en una cola
        await this.channel.sendToQueue(
          channel,
          content,
          { persistent: true }
        );
      }
      
      console.log(`Mensaje enviado a ${channel}:`, message);
    } catch (error) {
      console.error(`Error publicando en ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Suscribe un handler para consumir mensajes de una cola
   * @param {string} queue - Nombre de la cola
   * @param {Function} handler - Función callback para procesar mensajes
   */
  async subscribe(queue, handler) {
    try {
      // Asegurar que la cola exista
      await this.createQueue(queue);
      
      await this.channel.consume(queue, (message) => {
        if (message) {
          try {
            const content = JSON.parse(message.content.toString());
            console.log(`Mensaje recibido de ${queue}:`, content);
            
            // Llamar al handler con el contenido y el mensaje original
            handler(content, message);
          } catch (error) {
            console.error(`Error procesando mensaje de ${queue}:`, error);
            // En caso de error, rechazar el mensaje para que vuelva a la cola
            this.channel.nack(message, false, true);
          }
        }
      }, { noAck: false });
      
      console.log(`Consumidor registrado para ${queue}`);
    } catch (error) {
      console.error(`Error consumiendo de ${queue}:`, error);
      throw error;
    }
  }

  /**
   * Confirma el procesamiento exitoso de un mensaje
   * @param {Object} message - Mensaje original de RabbitMQ a confirmar
   */
  async acknowledge(message) {
    try {
      this.channel.ack(message);
    } catch (error) {
      console.error('Error confirmando mensaje:', error);
      throw error;
    }
  }

  /**
   * Cierra la conexión con RabbitMQ
   */
  async close() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
      console.log('Conexión con RabbitMQ cerrada');
    } catch (error) {
      console.error('Error cerrando conexión con RabbitMQ:', error);
      throw error;
    }
  }
}

module.exports = RabbitMQTransport;
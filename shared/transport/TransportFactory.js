require('dotenv').config();
const RabbitMQTransport = require('./RabbitMQTransport');
const TCPTransport = require('./TCPTransport');

/**
 * Fábrica para crear instancias del transporte configurado
 */
class TransportFactory {
  /**
   * Crea y devuelve una instancia del transporte configurado en .env
   * @param {string} serviceName - Nombre del servicio (necesario para TCP)
   * @returns {Object} - Instancia del transporte
   */
  static createTransport(serviceName) {
    const transportType = process.env.TRANSPORT_TYPE || 'rabbitmq';
    
    console.log(`Creando transporte de tipo: ${transportType}`);
    
    switch (transportType.toLowerCase()) {
      case 'rabbitmq':
        return new RabbitMQTransport();
      case 'tcp':
        return new TCPTransport();
      default:
        console.warn(`Tipo de transporte desconocido: ${transportType}, usando RabbitMQ por defecto`);
        return new RabbitMQTransport();
    }
  }
}

module.exports = TransportFactory;
const amqp = require('amqplib');

class RabbitMQClient {
  constructor() {
    this.connection = null;
    this.channel = null;
  }

  async connect() {
    try {
      this.connection = await amqp.connect('amqp://localhost');
      this.channel = await this.connection.createChannel();
      console.log('Connected to RabbitMQ');
      return this.channel;
    } catch (error) {
      console.error('Error connecting to RabbitMQ', error);
      throw error;
    }
  }

  async createQueue(queueName) {
    try {
      await this.channel.assertQueue(queueName, { durable: true });
      console.log(`Queue ${queueName} created or confirmed`);
    } catch (error) {
      console.error(`Error creating queue ${queueName}`, error);
      throw error;
    }
  }

  async publishMessage(queueName, message) {
    try {
      await this.channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
      console.log(`Message sent to ${queueName}:`, message);
    } catch (error) {
      console.error(`Error publishing to ${queueName}`, error);
      throw error;
    }
  }

  async consumeMessages(queueName, callback) {
    try {
      await this.channel.consume(
        queueName,
        (message) => {
          if (message) {
            const content = JSON.parse(message.content.toString());
            console.log(`Received message from ${queueName}:`, content);
            callback(content, message);
          }
        },
        { noAck: false }
      );
      console.log(`Consumer registered for ${queueName}`);
    } catch (error) {
      console.error(`Error consuming from ${queueName}`, error);
      throw error;
    }
  }

  async acknowledgeMessage(message) {
    try {
      this.channel.ack(message);
    } catch (error) {
      console.error('Error acknowledging message', error);
      throw error;
    }
  }

  async close() {
    try {
      await this.channel.close();
      await this.connection.close();
      console.log('Connection to RabbitMQ closed');
    } catch (error) {
      console.error('Error closing RabbitMQ connection', error);
      throw error;
    }
  }
}

module.exports = RabbitMQClient;
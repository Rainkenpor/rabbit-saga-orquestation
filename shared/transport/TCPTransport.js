const net = require('net');
const { v4: uuidv4 } = require('uuid');
const TransportInterface = require('./TransportInterface');

/**
 * Implementación de transporte usando sockets TCP
 */
class TCPTransport extends TransportInterface {
  constructor() {
    super();
    this.servers = {}; // Map de canales a servidores TCP
    this.clients = {}; // Map de canales a clientes conectados
    this.handlers = {}; // Map de canales a funciones de manejo de mensajes
    this.messageQueue = {}; // Cola de mensajes para canales sin conexiones activas
    this.serviceRegistry = {}; // Registro de servicios y sus puertos
    this.config = {
      host: process.env.TCP_HOST || 'localhost',
      portBase: parseInt(process.env.TCP_PORT_BASE || '4000')
    };
  }

  /**
   * Establece la configuración del transporte
   * @param {Object} options - Opciones de configuración
   */
  setConfig(options) {
    this.config = { ...this.config, ...options };
  }

  /**
   * Inicializa el transporte
   * @param {string} serviceName - Nombre del servicio actual
   */
  async initialize(serviceName) {
    try {
      // El nombre del servicio es necesario para TCP para definir puertos
      if (!serviceName) {
        throw new Error('El nombre del servicio es necesario para inicializar el transporte TCP');
      }

      // Registrar este servicio
      this.registerService(serviceName);

      console.log(`Transporte TCP inicializado para ${serviceName}`);
      return true;
    } catch (error) {
      console.error('Error inicializando transporte TCP:', error);
      throw error;
    }
  }

  /**
   * Registra un servicio y configura su puerto TCP basado en un mapeo conocido
   * @param {string} serviceName - Nombre del servicio
   * @returns {number} - Puerto asignado al servicio
   */
  registerService(serviceName) {
    // Asignar puertos basados en nombres conocidos de servicios
    const portMapping = {
      'orchestrator': 0, // El orquestador siempre es el puerto base
      'order-service': 1,
      'inventory-service': 2,
      'payment-service': 3
    };

    if (!portMapping.hasOwnProperty(serviceName)) {
      // Si es un servicio desconocido, usar un offset aleatorio mayor que los conocidos
      const offset = 10 + Object.keys(this.serviceRegistry).length;
      this.serviceRegistry[serviceName] = this.config.portBase + offset;
    } else {
      const offset = portMapping[serviceName];
      this.serviceRegistry[serviceName] = this.config.portBase + offset;
    }

    console.log(`Servicio ${serviceName} registrado con puerto ${this.serviceRegistry[serviceName]}`);
    return this.serviceRegistry[serviceName];
  }

  /**
   * Obtiene el puerto para un canal/servicio específico
   * @param {string} channel - Nombre del canal (normalmente es el nombre del servicio)
   * @returns {number} - Puerto asignado
   */
  getPortForChannel(channel) {
    // Extraer el nombre del servicio de la convención de nombres de colas
    // Por ejemplo, "order_service_queue" -> "order-service"
    const serviceName = channel
      .replace('_queue', '')
      .replace(/_/g, '-');

    if (!this.serviceRegistry[serviceName]) {
      this.registerService(serviceName);
    }

    return this.serviceRegistry[serviceName];
  }

  /**
   * Crea un servidor TCP para un canal específico
   * @param {string} channel - Canal para el que crear un servidor
   * @param {Function} handler - Función para manejar mensajes entrantes
   */
  async createServer(channel, handler) {
    const port = this.getPortForChannel(channel);
    
    // Guardar el handler para este canal
    this.handlers[channel] = handler;

    // Crear servidor TCP si no existe
    if (!this.servers[channel]) {
      const server = net.createServer((socket) => {
        socket.on('data', (data) => {
          try {
            const message = JSON.parse(data.toString());
            console.log(`Servidor ${channel} recibió mensaje:`, message);
            
            // Generar un identificador único para este mensaje
            const messageId = uuidv4();
            const wrappedMessage = { 
              content: message, 
              id: messageId,
              // Método para confirmar este mensaje
              ack: () => {
                socket.write(JSON.stringify({ type: 'ACK', messageId }));
              }
            };
            
            // Llamar al handler con el mensaje
            if (handler) {
              handler(message, wrappedMessage);
            } else if (this.handlers[channel]) {
              this.handlers[channel](message, wrappedMessage);
            }
          } catch (error) {
            console.error(`Error procesando mensaje en servidor ${channel}:`, error);
          }
        });

        socket.on('error', (err) => {
          console.error(`Error en socket servidor ${channel}:`, err);
        });
      });

      server.listen(port, this.config.host, () => {
        console.log(`Servidor TCP para ${channel} escuchando en ${this.config.host}:${port}`);
      });

      server.on('error', (err) => {
        console.error(`Error en servidor ${channel}:`, err);
      });

      this.servers[channel] = server;
    }
  }

  /**
   * Conecta con un servidor TCP para un canal específico
   * @param {string} channel - Canal (servicio) al que conectar
   */
  async connectToServer(channel) {
    if (this.clients[channel]) return; // Ya existe una conexión

    const port = this.getPortForChannel(channel);
    
    return new Promise((resolve, reject) => {
      const client = new net.Socket();

      client.connect(port, this.config.host, () => {
        console.log(`Conectado a servidor ${channel} en ${this.config.host}:${port}`);
        this.clients[channel] = client;

        // Enviar los mensajes en cola para este canal
        if (this.messageQueue[channel] && this.messageQueue[channel].length > 0) {
          console.log(`Enviando ${this.messageQueue[channel].length} mensajes en cola para ${channel}`);
          while (this.messageQueue[channel].length > 0) {
            const message = this.messageQueue[channel].shift();
            client.write(JSON.stringify(message));
          }
        }

        resolve(client);
      });

      client.on('data', (data) => {
        try {
          const message = JSON.parse(data.toString());
          // Aquí se procesarían las confirmaciones (ACK) si es necesario
          if (message.type === 'ACK') {
            console.log(`Recibido ACK para mensaje ${message.messageId} de ${channel}`);
          }
        } catch (error) {
          console.error(`Error procesando respuesta de ${channel}:`, error);
        }
      });

      client.on('close', () => {
        console.log(`Conexión con servidor ${channel} cerrada`);
        delete this.clients[channel];
      });

      client.on('error', (err) => {
        console.error(`Error en conexión con servidor ${channel}:`, err);
        if (!this.clients[channel]) {
          reject(err);
        }
      });
    });
  }

  /**
   * Publica un mensaje en un canal específico
   * @param {string} channel - Canal donde publicar
   * @param {Object} message - Mensaje a publicar
   */
  async publish(channel, message) {
    try {
      // Intentar conectar si no hay conexión establecida
      if (!this.clients[channel]) {
        try {
          await this.connectToServer(channel);
        } catch (error) {
          // Si no se puede conectar, encolar el mensaje para envío posterior
          if (!this.messageQueue[channel]) {
            this.messageQueue[channel] = [];
          }
          this.messageQueue[channel].push(message);
          console.log(`Mensaje para ${channel} encolado para envío posterior`);
          return;
        }
      }
      
      // Enviar mensaje
      this.clients[channel].write(JSON.stringify(message));
      console.log(`Mensaje enviado a ${channel}:`, message);
    } catch (error) {
      console.error(`Error enviando mensaje a ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Suscribe a un canal para recibir mensajes
   * @param {string} channel - Canal al que suscribirse
   * @param {Function} handler - Función callback para procesar mensajes
   */
  async subscribe(channel, handler) {
    await this.createServer(channel, handler);
    console.log(`Suscrito a canal ${channel}`);
  }

  /**
   * Confirma el procesamiento de un mensaje
   * @param {Object} message - Mensaje a confirmar (debe tener método ack())
   */
  async acknowledge(message) {
    if (message && typeof message.ack === 'function') {
      message.ack();
    }
  }

  /**
   * Cierra todas las conexiones TCP
   */
  async close() {
    try {
      // Cerrar todos los clientes
      for (const channel in this.clients) {
        this.clients[channel].end();
      }

      // Cerrar todos los servidores
      for (const channel in this.servers) {
        this.servers[channel].close();
      }
      
      console.log('Todas las conexiones TCP cerradas');
    } catch (error) {
      console.error('Error cerrando conexiones TCP:', error);
      throw error;
    }
  }
}

module.exports = TCPTransport;
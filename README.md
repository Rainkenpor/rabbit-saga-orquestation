# Microservicios con Patrón Saga (Orquestación) y Transportes Intercambiables

Este proyecto es un ejemplo de arquitectura de microservicios utilizando el patrón Saga con enfoque de Orquestación, que permite cambiar dinámicamente entre diferentes transportes de comunicación como RabbitMQ o TCP.

## Descripción del Proyecto

El proyecto simula una aplicación de e-commerce donde tenemos cuatro microservicios principales:

1. **Order Service**: Maneja la creación y administración de órdenes.
2. **Inventory Service**: Administra el inventario de productos.
3. **Payment Service**: Procesa pagos asociados a las órdenes.
4. **Orchestrator**: Coordina la transacción distribuida (saga) entre los servicios.

## Patrón Saga - Orquestación

En este proyecto demostramos el patrón Saga con enfoque de orquestación, donde un componente central (Orchestrator) coordina todas las transacciones y maneja las compensaciones en caso de fallos.

### Flujo de la Saga:

1. El usuario crea una orden (Order Service)
2. El orquestador recibe el evento ORDER_CREATED
3. El orquestador solicita verificación de inventario (Inventory Service)
4. Si hay inventario suficiente, se reserva temporalmente
5. El orquestador solicita el pago (Payment Service)
6. Si el pago es exitoso, se confirma la reserva de inventario
7. La orden se marca como completada
8. En caso de fallos en cualquier paso, se ejecutan transacciones compensatorias

## Sistema de Transporte Configurable

Una característica destacada de esta implementación es la capacidad de cambiar dinámicamente entre diferentes sistemas de transporte para la comunicación entre microservicios.

### Transportes disponibles:

- **RabbitMQ**: Broker de mensajería tradicional para arquitecturas de microservicios
- **TCP**: Comunicación directa entre servicios mediante sockets TCP

### Configuración del transporte:

La selección del transporte se realiza a través del archivo `.env`:

```properties
# Configuración de transporte
TRANSPORT_TYPE=rabbitmq
# TRANSPORT_TYPE=tcp

# Configuración RabbitMQ
RABBITMQ_URL=amqp://localhost
RABBITMQ_EXCHANGE=saga_exchange

# Configuración TCP
TCP_HOST=localhost
TCP_PORT_BASE=4000
```

### Arquitectura de Transporte Desacoplado:

El sistema utiliza un patrón de diseño basado en interfaces para abstraer completamente la implementación del transporte:

1. **TransportInterface**: Define los métodos comunes que debe implementar cualquier transporte
2. **RabbitMQTransport**: Implementación utilizando RabbitMQ
3. **TCPTransport**: Implementación utilizando sockets TCP
4. **TransportFactory**: Fábrica que crea la instancia de transporte adecuada según la configuración
5. **MessageService**: Capa de servicio que abstrae el uso del transporte para los microservicios

Esta arquitectura permite:
- Cambiar fácilmente entre diferentes transportes sin modificar el código de los microservicios
- Agregar nuevos transportes extendiendo la interfaz común
- Hacer pruebas con diferentes tecnologías de comunicación sin afectar la lógica de negocio

## Arquitectura Modular del Orquestador

El orquestador de este proyecto implementa un sistema modular que permite añadir nuevos microservicios de manera sencilla:

### Estructura de Carpetas

```
orchestrator/
├── index.js               # Punto de entrada del orquestador
└── services/              # Servicios disponibles para el orquestador
    ├── inventoryService.js
    ├── paymentService.js
    └── orderService.js
```

### Contratos de Servicio

Cada servicio define un contrato en `shared/contracts.js` que especifica:

- Nombre del servicio
- Cola de mensajería
- Eventos que maneja
- Eventos que produce
- Esquemas de datos para validación
- Compensaciones asociadas

### Cómo Añadir un Nuevo Microservicio

1. **Definir el Contrato**: Añadir un nuevo contrato en `shared/contracts.js`

```javascript
const nuevoServicioContract = {
  name: 'nuevo-servicio',
  queueName: 'nuevo_servicio_queue',
  handles: ['EVENTO_A_MANEJAR_1', 'EVENTO_A_MANEJAR_2'],
  produces: ['EVENTO_RESULTADO_1', 'EVENTO_RESULTADO_2'],
  schema: {
    // Esquemas para validación
  },
  compensations: {
    // Mapeo de compensaciones
  }
};
```

2. **Implementar el Servicio**: Crear un archivo en `orchestrator/services/`

```javascript
const { EVENTS } = require('../../shared/constants');
const { nuevoServicioContract } = require('../../shared/contracts');

const contract = nuevoServicioContract;

async function handleEvento(data, sagaContext) {
  // Implementación
  return {
    success: true,
    event: 'EVENTO_RESULTADO',
    data: { /* ... */ }
  };
}

const handlers = {
  'EVENTO_A_MANEJAR': handleEvento
};

async function processEvent(event, sagaContext) {
  const handler = handlers[event.type];
  if (!handler) {
    throw new Error(`No hay manejador para ${event.type}`);
  }
  return await handler(event.data, sagaContext);
}

module.exports = { contract, processEvent, handlers };
```

3. **Implementar el Microservicio Real**: Crear un servicio independiente que se comunique con el transporte configurado

## Requisitos Previos

- Node.js (v14 o superior)
- RabbitMQ (instalado y ejecutándose en localhost) si se utiliza el transporte RabbitMQ

## Instalación

```bash
# Instalar todas las dependencias
npm run install-all
```

## Ejecución

```bash
# Iniciar todos los microservicios en modo desarrollo
npm run dev

# Iniciar todos los microservicios en modo producción
npm run start

# Ejecutar servicios individualmente
npm run dev:orchestrator
npm run dev:order
npm run dev:inventory
npm run dev:payment
```

## Probando el Sistema

Una vez que los servicios estén en ejecución, puedes probar el sistema con los siguientes endpoints:

### Crear una Orden (Inicia la Saga)

```bash
curl -X POST http://localhost:3002/orders -H "Content-Type: application/json" -d '{
  "customerId": "customer-1",
  "items": [
    {
      "id": "item-1",
      "name": "Product 1",
      "price": 100,
      "quantity": 2
    }
  ]
}'
```

### Verificar Estado de Inventario

```bash
curl http://localhost:3001/inventory
```

### Verificar Estado de las Órdenes

```bash
curl http://localhost:3002/orders
```

### Verificar Estado de la Saga

```bash
curl http://localhost:3000/sagas
```

### Verificar Servicios Registrados

```bash
curl http://localhost:3000/services
```

## Casos de Prueba

### Caso 1: Saga Exitosa
- Crear una orden con items disponibles en inventario
- Cliente con fondos suficientes

### Caso 2: Fallo por Inventario
- Crear una orden con items no disponibles (ej. item-3)

### Caso 3: Fallo por Pago
- Crear una orden para cliente sin fondos suficientes (ej. customer-3)
- O crear una orden para cliente inexistente

## Cambiar entre Transportes

Para cambiar entre los diferentes transportes de mensajería:

1. Editar el archivo `.env` en la raíz del proyecto
2. Configurar `TRANSPORT_TYPE=rabbitmq` o `TRANSPORT_TYPE=tcp`
3. Reiniciar todos los servicios

```bash
# Detener todos los servicios (si están ejecutándose)
# Luego iniciarlos nuevamente
npm run dev
```

Esto cambiará dinámicamente el mecanismo de comunicación entre los microservicios sin necesidad de cambiar el código.
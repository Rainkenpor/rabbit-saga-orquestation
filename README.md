# Microservicios con RabbitMQ y Patrón Saga (Orquestación)

Este proyecto es un ejemplo de arquitectura de microservicios utilizando RabbitMQ como broker de mensajería y el patrón Saga con enfoque de Orquestación.

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

## Requisitos Previos

- Node.js (v14 o superior)
- RabbitMQ (instalado y ejecutándose en localhost)

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

## Casos de Prueba

### Caso 1: Saga Exitosa
- Crear una orden con items disponibles en inventario
- Cliente con fondos suficientes

### Caso 2: Fallo por Inventario
- Crear una orden con items no disponibles (ej. item-3)

### Caso 3: Fallo por Pago
- Crear una orden para cliente sin fondos suficientes (ej. customer-3)
- O crear una orden para cliente inexistente
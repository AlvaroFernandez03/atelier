# Atelier — Tienda de ropa y calzado

Tienda online con catálogo filtrable, fichas de producto con tallas y colores,
carrito que funciona con o sin cuenta, y zona de cliente. Proyecto de práctica
y portfolio.

## Demo en vivo

**[alvarofo-atelier.onrender.com](https://alvarofo-atelier.onrender.com)** · forma parte de mi portfolio: **[alvarofernandez03.github.io](https://alvarofernandez03.github.io/)**

Dentro tienes una cinta con las cuentas de prueba para entrar con un clic
(contraseña de todas: `cliente123`):

| Cuenta | Email |
|---|---|
| Cliente con pedidos | `marta@ejemplo.com` |
| Administración de la tienda | `admin@tienda.com` |

Está en el plan gratuito de Render: si nadie la ha usado en un rato, tarda
hasta un minuto en despertar. Los datos son de ejemplo y se reinician solos
cada vez que despierta, así que puedes tocar lo que quieras.

En la demo, Marta ya tiene un pedido entregado (con reseña y una devolución pendiente) y otro en camino, y hay pedidos de otros clientes para que el panel tenga cifras (`backend/db/seed-demo.js`).

<details>
<summary>Cómo funciona el modo demo</summary>

La demo pública arranca con la variable `DEMO=1`. Con ella, `backend/demo.js`
añade la cinta con las cuentas de prueba a cada página y bloquea lo que
dejaría fuera a las siguientes visitas (cambiar la contraseña de una cuenta de
prueba, desactivarla...). Sin `DEMO=1`, en tu ordenador, la app funciona
exactamente igual que siempre. La configuración de Render está en el
`render.yaml` del [repositorio del portfolio](https://github.com/AlvaroFernandez03/AlvaroFernandez03.github.io).

</details>

## Estado actual

Tienda completa por ambos lados: el cliente compra y devuelve, y la tienda
gestiona productos, stock, pedidos y devoluciones desde su propio panel.
Queda pendiente el sistema de fotos reales de producto.

## Cómo ejecutarlo

Necesitas [Node.js](https://nodejs.org) versión 22.5 o superior.

1. `cd backend && npm install`
2. Copia `.env.example` como `.env` y cambia `JWT_SECRET`
3. `npm start`
4. Abre **http://localhost:3000**

Si el puerto 3000 está ocupado por otro proyecto, cambia `PORT` en el `.env`.

## Emails (opcional)

Sin configurar nada la tienda funciona igual, pero sin enviar correos. Para activarlos:

1. Crea una cuenta gratuita en [resend.com](https://resend.com)
2. Pon la API key en `RESEND_API_KEY` dentro de tu `.env`
3. Reinicia el servidor

Se envían tres correos: **bienvenida** al crear la cuenta, **confirmación de
pedido** con el detalle completo, y **aviso de cambio de contraseña**.

No se envía nada al iniciar sesión: ninguna tienda real lo hace, porque
satura el buzón y acaba consiguiendo que se ignoren los avisos que sí importan.

**Importante**: sin verificar un dominio propio en Resend solo puedes enviar
correos a la dirección con la que te registraste allí — suficiente para probarlo.

## Cuentas de prueba (contraseña `cliente123`)

| Email | Rol | Qué ve |
|---|---|---|
| marta@ejemplo.com | Cliente | Tienda, sus pedidos y devoluciones |
| admin@tienda.com | Administración | Todo lo anterior + el panel en `/admin.html` |

Al entrar como administración aparece un enlace **Panel** en la cabecera.

## Cómo está montado

### Productos y variantes: la decisión clave

Una tienda de ropa no vende "productos", vende **combinaciones concretas**:
no compras "una camiseta", compras "esa camiseta, en negro, talla M". Por eso
hay dos tablas separadas:

- `products` — nombre, marca, categoría, precio, descripción
- `variants` — cada combinación de talla y color, **con su propio stock**

Así una talla puede agotarse sin que se agote el producto entero, que es
justo lo que pasa en una tienda real.

### Los precios se guardan en céntimos

`2999` en lugar de `29.99`. Los números decimales pierden precisión al
operar con ellos en programación (`0.1 + 0.2` no da exactamente `0.3`), y en
una tienda eso acabaría produciendo totales incorrectos. Se guardan como
enteros y solo se convierten a euros al mostrarlos.

### El pedido es un documento histórico

Al tramitar un pedido, el nombre, la marca y el precio de cada artículo se
**copian** en `order_items`. Si mañana sube el precio o se renombra el
producto, ese pedido antiguo debe seguir mostrando lo que el cliente pagó
realmente. Por eso no se guarda solo una referencia al producto.

### El descuento de stock es atómico

Crear el pedido, copiar sus líneas, descontar el stock y vaciar el carrito
ocurren dentro de una **transacción**: o se hace todo, o no se hace nada. Si
alguien se lleva la última unidad justo mientras otro cliente está pagando,
el pedido se rechaza entero y la base de datos queda intacta — no se queda un
pedido a medias ni stock descontado de una compra que no llegó a completarse.

### El asistente de tallas no usa inteligencia artificial

Y es a propósito. Una talla es un **cálculo**, no una conversación: el
asistente estima el contorno de pecho (o de cintura, en pantalones) a partir
de la altura y el peso, lo busca en una tabla de tallas, y ajusta según el
tipo de prenda (una sudadera se lleva más holgada que una camiseta) y la
preferencia de la persona.

Interpreta preguntas escritas en lenguaje natural ("mido 1,70 y peso 65,
¿qué talla cojo?") extrayendo los datos con expresiones regulares. Ventajas
frente a usar un modelo de lenguaje: la respuesta es siempre coherente y
explicable, no hace falta clave de API ni conexión, y no puede inventarse
una talla que no existe. Además cruza la recomendación con el **stock real**,
así que te dice si esa talla está disponible y en qué colores.

Para calzado no estima nada desde altura y peso — el pie no guarda esa
relación — y pide directamente la talla habitual o la longitud del pie.

### Las reseñas solo las escribe quien compró

Cada reseña está ligada a una línea de pedido concreta (`order_item_id`), lo
que demuestra la compra. Eso permite mostrar la etiqueta "compra verificada",
saber qué talla y color compró quien opina, e impedir que alguien deje dos
reseñas de la misma compra.

Con esa información la ficha calcula un **veredicto de talla** ("talla
pequeña según el 70% de quienes lo han comprado"), que es justo el dato que
más ayuda a decidir en una tienda de ropa.

### El stock se mueve solo en ambas direcciones

Cada acción que afecta a la disponibilidad ajusta el stock automáticamente:
comprar lo descuenta, **cancelar un pedido** lo devuelve, y **aceptar una
devolución** también. Todo dentro de transacciones, para que nunca quede a
medias.

### Devoluciones por unidades, no por pedido

Se puede devolver **parte** de un pedido: si compraste 3 camisetas y solo
quieres devolver 1, el sistema lleva la cuenta de cuántas unidades de cada
línea siguen siendo devolvibles. Las devoluciones ya solicitadas o aceptadas
descuentan del total; una rechazada no, porque esas unidades siguen siendo
del cliente.

Hay un plazo de 30 días desde la fecha del pedido, y al **aceptar** una
devolución las unidades vuelven automáticamente al stock (al rechazarla, no).

### Carrito sin cuenta

Puedes llenar el carrito sin registrarte: el navegador guarda un
identificador de invitado y el carrito se asocia a él. Al iniciar sesión o
crear una cuenta, ese carrito **se fusiona** con el de la cuenta (sumando
cantidades si un artículo estaba en ambos, siempre respetando el stock).

### Imágenes: fotos reales con siluetas de respaldo

La tienda usa un sistema híbrido. Cada producto tiene guardado el nombre de
un archivo de foto; si ese archivo existe en `frontend/img/productos/`, se
muestra la foto. **Si no existe, la tienda cae automáticamente en una
silueta SVG** dibujada por código y coloreada según la variante elegida.

Así el catálogo nunca se rompe: funciona perfectamente sin ninguna foto, y
puedes irlas añadiendo de una en una. Las instrucciones (qué buscar, dónde,
con qué nombre y cómo prepararlas) están en
`frontend/img/productos/LEEME.md`.

Las siluetas están en `frontend/js/product-art.js`: camiseta, sudadera,
pantalón, chaqueta, zapatilla y bota.

### Las marcas son inventadas

Northline, Vela Studio, Kudo, Ferrer & Co y Duna no existen. Usar marcas
reales con sus logos y fotos en un proyecto público sería un problema de
propiedad intelectual.

## Estructura

```
tienda/
├── backend/
│   ├── db/
│   │   ├── schema.js       -> definición de todas las tablas
│   │   ├── seed.js          -> catálogo de ejemplo (15 productos, 270 variantes)
│   │   └── database.js       -> conexión SQLite
│   ├── routes/                -> auth, catalog, cart, orders, returns, admin, favorites, account, assistant, reviews
│   ├── services/                -> cartService, email, sizeAdvisor (tallas), assistant (chat)
│   ├── services/email.js       -> emails con Resend (opcional)
│   ├── middleware/auth.js      -> sesión obligatoria, opcional (invitados) y admin
│   ├── services/cartService.js  -> lógica de carrito y fusión invitado → cliente
│   └── server.js
└── frontend/
    ├── index.html        -> portada
    ├── catalogo.html      -> catálogo con filtros
    ├── producto.html       -> ficha con selector de color y talla
    ├── carrito.html         -> carrito
    ├── checkout.html         -> dirección de envío y confirmación
    ├── pedido.html            -> detalle de un pedido
    ├── cuenta.html             -> área de cliente: pedidos, devoluciones, favoritos y ajustes
    ├── devolucion.html          -> solicitar una devolución
    ├── admin.html                -> panel de administración
    ├── acceso.html              -> iniciar sesión / crear cuenta
    └── js/product-art.js         -> siluetas SVG de producto
```

## Qué funciona ya

- ✅ Catálogo con filtros por categoría, marca, talla, color y precio, más búsqueda y ordenación
- ✅ Los filtros se guardan en la URL (se puede compartir o volver atrás sin perderlos)
- ✅ Ficha de producto con selección de color, talla y **cantidad**, avisos de stock bajo y tallas agotadas
- ✅ Tallas de calzado del 35 al 47
- ✅ **Fotos reales de producto** con silueta de respaldo automática si el archivo no está
- ✅ **Favoritos**: guarda productos con el corazón desde el catálogo o la ficha, y consúltalos en tu cuenta
- ✅ **Ajustes de cuenta**: cambiar el nombre y la contraseña (pidiendo siempre la actual, con aviso por email)
- ✅ **Asistente de tallas**: chat flotante que recomienda talla a partir de altura y peso, y responde dudas sobre stock, material, envíos y devoluciones
- ✅ **Reseñas de producto** con estrellas, solo para quien lo ha comprado, con veredicto automático de cómo talla
- ✅ **Productos relacionados** en cada ficha, ordenados por relevancia real (categoría, marca, precio parecido y stock)
- ✅ Carrito completo: añadir, cambiar cantidades, quitar, con control de stock en cada paso
- ✅ Carrito para invitados, que se fusiona con la cuenta al identificarse
- ✅ Envío gratis a partir de 50 €, con aviso de cuánto falta para llegar
- ✅ **Checkout** con dirección de envío y descuento real de stock en una transacción
- ✅ **Confirmación de pedido** con su número, resumen y dirección
- ✅ **Área de cliente** con historial de pedidos y detalle de cada uno
- ✅ **Emails** de bienvenida y confirmación de pedido (opcionales)
- ✅ **Devoluciones**: solicitud por unidades desde el detalle del pedido, con control de plazo y de cantidades ya devueltas
- ✅ Sección "Mis devoluciones" en el área de cliente, con su estado
- ✅ **Panel de administración** con cinco secciones:
  - **Resumen**: ingresos, pedidos del día, pendientes, y lista de stock bajo
  - **Pedidos**: todos los pedidos, con cambio de estado (por enviar → enviado → entregado)
  - **Devoluciones**: aceptar o rechazar las solicitudes de los clientes
  - **Productos**: listado, control de stock talla por talla, y alta de productos nuevos
  - **Clientes**: registrados, con su número de pedidos y total gastado
- ✅ Registro e inicio de sesión con contraseñas cifradas (bcrypt) y tokens JWT

## Diseño: "señalética urbana"

La identidad visual se apoya en el mundo del streetwear: rótulos de tienda,
serigrafía y etiquetas de ropa.

- **El color informa, no decora.** Cada categoría tiene su color fijo en toda
  la tienda (camisetas cobalto, sudaderas llama, pantalones violeta,
  chaquetas verde, zapatillas negro, botas amarillo), así se aprende a
  reconocerlas de un vistazo. Son tonos vivos pero sin llegar al neón.
- **La portada abre con un mosaico de bloques de categoría**, no con un
  carrusel: todo queda a la vista de golpe, sin esperar a que pasen
  diapositivas. Uno de los bloques lleva texto oscuro sobre amarillo, para
  romper la repetición de "color + texto blanco".
- **Tipografía**: una sola familia, Archivo, en dos personalidades. Titulares
  en su corte ancho y muy pesado, con el aire de la rotulación deportiva;
  cuerpo en el corte normal.
- **Barra de avisos** arriba y **tira de confianza** bajo la portada, con lo
  que un cliente quiere saber antes de comprar: plazos, devoluciones, tallas.
- Adaptado a móvil, con foco de teclado visible y respetando la preferencia
  de movimiento reducido del sistema.

## Estado

La tienda está terminada: se puede comprar, devolver, opinar, guardar
favoritos, preguntar dudas al asistente de tallas y gestionarlo todo desde
el panel de administración.

## Notas

- Cambia `JWT_SECRET` en `.env` antes de usarlo en serio, y no subas el `.env` a ningún repositorio.
- No hay pasarela de pago real: el checkout será simulado, como corresponde a un proyecto de práctica.

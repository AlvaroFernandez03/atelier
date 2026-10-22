# Fotos de producto

La tienda funciona perfectamente **sin ninguna foto**: cada producto se dibuja
con su silueta. Pero si pones aquí las fotos, aparecerán automáticamente en el
catálogo, la portada y la ficha del producto.

## Cómo funciona

Cada producto tiene guardado el nombre del archivo que espera. Al cargar la
página, la tienda intenta mostrar esa foto; **si el archivo no existe, cae
sola en la silueta SVG**. Por eso puedes ir añadiéndolas de una en una sin
que nada se rompa por el camino.

## Dónde conseguirlas (gratis y de uso libre)

- [Unsplash](https://unsplash.com) — la mejor calidad para ropa
- [Pexels](https://pexels.com)
- [Pixabay](https://pixabay.com)

Las tres permiten uso comercial sin pedir permiso ni pagar. **No uses fotos
sacadas de Google Imágenes o de webs de marcas reales**: tienen derechos de
autor y no puedes publicarlas en tu portfolio.

## Consejos para que quede bien

- Busca fotos **sobre fondo blanco o liso**, del producto solo (no de una
  persona posando de cuerpo entero). En Unsplash busca cosas como
  `black t-shirt product`, `white sneakers isolated`, `denim jacket flat lay`.
- **Recórtalas cuadradas** (misma anchura que altura). Es lo que más se nota:
  con fotos cuadradas la cuadrícula queda perfecta, y con fotos de proporciones
  distintas se ve descuadrado.
- Redúcelas a unos **800×800 píxeles**. Una foto de 4000px tarda en cargar y
  no se ve mejor.
- Guárdalas en **.jpg** con los nombres exactos de la lista de abajo.

Para recortar y redimensionar sin instalar nada: [squoosh.app](https://squoosh.app)
o [photopea.com](https://photopea.com).

## Lista de archivos

Pon aquí los que quieras, con estos nombres exactos:

### Camisetas
- `camiseta-basica.jpg` — camiseta lisa de manga corta
- `camiseta-oversize.jpg` — camiseta ancha, aire vintage
- `camiseta-running.jpg` — camiseta deportiva técnica

### Sudaderas
- `sudadera-capucha.jpg` — sudadera con capucha
- `sudadera-cuello-redondo.jpg` — sudadera sin capucha

### Pantalones
- `vaquero-recto.jpg` — vaqueros azules
- `pantalon-chino.jpg` — chino beige o verde
- `pantalon-jogger.jpg` — jogger de felpa

### Chaquetas
- `chaqueta-vaquera.jpg` — cazadora denim
- `cazadora-cortavientos.jpg` — chaqueta ligera técnica

### Zapatillas
- `zapatilla-urbana.jpg` — zapatilla de piel lisa
- `zapatilla-running.jpg` — zapatilla deportiva
- `zapatilla-retro.jpg` — zapatilla de lona clásica

### Botas
- `bota-chelsea.jpg` — bota chelsea de piel
- `bota-montana.jpg` — bota de montaña

## Para productos que crees tú desde el panel

Los productos nuevos que des de alta en el panel de administración no tienen
foto asignada: se verán con su silueta. Si quieres darles foto, hay que
añadir el nombre del archivo en la columna `image_file` de la tabla
`products` (con DB Browser for SQLite, por ejemplo).

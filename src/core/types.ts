// Modelo de datos del proyecto. Todas las medidas en milímetros salvo que se indique.

export type Mm = number;

export interface Rect {
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
}

/** Tamaño del corte. El sangrado es fijo (`BLEED_MM`). */
export interface CardSize {
  width: Mm;
  height: Mm;
  /** Margen de seguridad: entre él y el corte está la zona peligrosa. */
  safe?: Mm;
}

export interface FontSpec {
  family: string;
  /** Tamaño en puntos tipográficos. */
  size: number;
  weight?: string | number;
  style?: 'normal' | 'italic';
  color?: string;
  strokeColor?: string;
  strokeWidth?: Mm;
}

interface ZoneBase {
  id: string;
  /** Posición relativa a la esquina del corte (sin sangrado). */
  rect: Rect;
  /** Los bordes que tocan el borde de la carta se extienden hasta el sangrado. */
  bleed?: boolean;
  /** No se dibuja (útil al diseñar). */
  hidden?: boolean;
  /** No se puede seleccionar con el ratón en el editor. */
  locked?: boolean;
  /** Solo se dibuja si la carta cumple la condición (ver `parseCondition`): «rareza=legendaria». */
  showIf?: string;
}

export interface ImageZone extends ZoneBase {
  type: 'image';
  /** Columna del CSV con la ruta de la imagen. Vacía = `default`; "-" = ocultar. */
  bind?: string;
  default?: string;
  fit?: 'cover' | 'contain' | 'stretch';
  /** Columna del CSV con el encuadre de cada carta («30% 40% 1.5»: punto central y zoom). Solo con «cubrir». */
  cropBind?: string;
}

export interface TextZone extends ZoneBase {
  type: 'text';
  /** Columna del CSV. Si existe `<bind>-<idioma>` se usa esa. */
  bind: string;
  /** Columna del CSV con el color del texto (sustituye a `font.color`). */
  colorBind?: string;
  default?: string;
  font: FontSpec;
  align?: 'left' | 'center' | 'right' | 'justify';
  valign?: 'top' | 'middle' | 'bottom';
  lineHeight?: number;
  /** Tamaño mínimo (pt) al que se reduce el texto si no cabe. */
  minSize?: number;
  padding?: Mm;
}

export interface AttributesZone extends ZoneBase {
  type: 'attributes';
  /** Columna del CSV, por defecto "atributos". */
  bind?: string;
  /** Si se indica, la zona solo dibuja estos atributos (para repartirlos entre zonas). */
  keys?: string[];
  direction?: 'column' | 'row';
  align?: 'start' | 'center' | 'end';
  gap?: Mm;
  iconSize: Mm;
  valuePosition?: 'over' | 'after' | 'below';
  /** Sin valor, escribir el nombre del atributo junto al icono («Volar»). */
  labels?: boolean;
  /** Fondo redondeado detrás de cada icono (color o nombre de la paleta), para que se lea sobre la ilustración. */
  backdrop?: string;
  /** 0–1. */
  backdropOpacity?: number;
  font: FontSpec;
}

/** Un atributo concreto en una posición fija ("la velocidad va arriba a la derecha"). */
export interface AttributeZone extends ZoneBase {
  type: 'attribute';
  /** Clave del catálogo de atributos. */
  key: string;
  /** Columna del CSV con los atributos, por defecto "atributos". */
  bind?: string;
  /** Icono propio de esta zona en lugar del del catálogo. */
  icon?: string;
  /** Dónde va el valor dentro de la zona. */
  valuePosition?: 'over' | 'after' | 'below' | 'none';
  /** Dibujar el icono aunque la carta no tenga ese atributo. */
  showIfMissing?: boolean;
  font: FontSpec;
}

/** Rectángulo (con esquinas redondeadas) o elipse de color: cintas, fondos de texto, gemas de rareza. */
export interface ShapeZone extends ZoneBase {
  type: 'shape';
  shape?: 'rect' | 'ellipse';
  /** Color fijo o nombre de la paleta del proyecto. */
  fill?: string;
  /** Columna del CSV con el color de relleno (sustituye a `fill`; «-» = sin relleno). */
  fillBind?: string;
  stroke?: string;
  strokeBind?: string;
  strokeWidth?: Mm;
  /** Radio de las esquinas (solo rectángulos). */
  radius?: Mm;
  /** 0–1. */
  opacity?: number;
}

export type Zone = ImageZone | TextZone | AttributesZone | AttributeZone | ShapeZone;
export type ZoneType = Zone['type'];

export interface Template {
  /** Permite que un tipo tenga otro tamaño de carta. */
  size?: Partial<CardSize>;
  /** `id` de la carta del CSV que hace de trasera por defecto (la columna «trasera» la sustituye). */
  back?: string;
  zones: Zone[];
}

export interface AttributeDef {
  icon: string;
  label?: string;
}

export interface FontFile {
  family: string;
  file: string;
  weight?: string;
  style?: string;
}

/** Ajustes de exportación guardados con el proyecto. */
export interface ExportSettings {
  dpi: number;
  format: 'png' | 'jpg';
  /** Calidad JPG en %, de 50 a 100. */
  quality: number;
}

export interface Project {
  name: string;
  csv: string;
  assetsDir: string;
  card: CardSize;
  fonts: FontFile[];
  attributes: Record<string, AttributeDef>;
  templates: Record<string, Template>;
  /** Colores con nombre: se usan en plantillas y en el CSV («fuego», «legendaria»). */
  colors?: Record<string, string>;
  export?: Partial<ExportSettings>;
}

/** Una fila del CSV, con las cabeceras normalizadas (ver `normalizeKey`). */
export type CardRow = Record<string, string>;

#!/usr/bin/env python3
"""Genera los manuales de usuario y el Acuerdo Marco del sistema en PDF (Versión 1.0).

Replica el formato original: hoja carta (letter), encabezado en cada página,
títulos en serif y cuerpo en sans-serif, pie de página con página y versión.

Uso:
    python generate_docs.py [--out DIR]
"""

import os
import sys

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.pdfgen import canvas as _pdfcanvas
from functools import partial

# ---------------------------------------------------------------------------
# Estilos
# ---------------------------------------------------------------------------
SERIF = "Times-Roman"
SERIF_B = "Times-Bold"
SERIF_I = "Times-Italic"
SANS = "Helvetica"
SANS_B = "Helvetica-Bold"
SANS_O = "Helvetica-Oblique"

def _mk(name, font, size, leading, align=TA_LEFT, space_before=0, space_after=6, color=colors.HexColor("#1F2937"), **kwargs):
    return ParagraphStyle(
        name, fontName=font, fontSize=size, leading=leading, alignment=align,
        spaceBefore=space_before, spaceAfter=space_after, textColor=color,
        bulletFontName=kwargs.pop("bulletFontName", font), bulletFontSize=kwargs.pop("bulletFontSize", size), bulletIndent=kwargs.pop("bulletIndent", 0),
        **kwargs,
    )

st_title = _mk("title", SERIF_B, 22, 28, TA_CENTER, 0, 6)
st_subtitle = _mk("subtitle", SERIF, 13, 18, TA_CENTER, 0, 6)
st_ver = _mk("ver", SANS, 10, 14, TA_CENTER, 0, 2, colors.HexColor("#6B7280"))
st_h1 = _mk("h1", SERIF_B, 14, 18, TA_LEFT, 10, 4, colors.HexColor("#374151"), keepWithNext=1)
st_h2 = _mk("h2", SERIF_B, 11.5, 15, TA_LEFT, 5, 2, colors.HexColor("#4B5563"), keepWithNext=1)
st_body = _mk("body", SANS, 10, 14.5, TA_JUSTIFY, 0, 3)
st_bullet = _mk("bullet", SANS, 10, 14.5, TA_JUSTIFY, 0, 2, colors.HexColor("#1F2937"),
                bulletFontName=SANS, bulletFontSize=10)
st_num = _mk("num", SANS, 10, 14.5, TA_JUSTIFY, 0, 2)
st_note = _mk("note", SANS_O, 9.5, 13.5, TA_LEFT, 0, 3, colors.HexColor("#6B7280"))
st_table_head = _mk("thead", SANS_B, 9, 11, TA_LEFT, 0, 0, colors.white, wordWrap="CJK")
st_table_cell = _mk("tcell", SANS, 9, 11.5, TA_LEFT, 0, 0, wordWrap="CJK")
st_table_cell_c = _mk("tcellc", SANS, 9, 11.5, TA_CENTER, 0, 0, wordWrap="CJK")
st_quote = _mk("quote", SERIF_I, 10, 14.5, TA_JUSTIFY, 0, 3)

# ---------------------------------------------------------------------------
# Encabezado y pie de página
# ---------------------------------------------------------------------------
class _PagedCanvas(_pdfcanvas.Canvas):
    """Canvas que dibuja el pie con 'Página N de M' en una segunda pasada."""

    def __init__(self, *args, **kwargs):
        self._version = kwargs.pop("version", "")
        super().__init__(*args, **kwargs)
        self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self._draw_footer(total)
            _pdfcanvas.Canvas.showPage(self)
        _pdfcanvas.Canvas.save(self)

    def _draw_footer(self, total):
        self.setFont(SANS, 8)
        self.setFillColor(colors.HexColor("#9CA3AF"))
        self.drawCentredString(letter[0] / 2, 1.4 * cm, f"Página {self._pageNumber} de {total}")
        self.drawCentredString(letter[0] / 2, 1.1 * cm, f"Versión {self._version}")


class DocBuilder:
    def __init__(self, path, header_left, header_right, version):
        self.path = path
        self.header_left = header_left
        self.header_right = header_right
        self.version = version
        self.story = []
        self.base = os.path.dirname(os.path.abspath(path))

    def build(self):
        doc = SimpleDocTemplate(
            self.path, pagesize=letter,
            leftMargin=2.2 * cm, rightMargin=2.2 * cm,
            topMargin=2.6 * cm, bottomMargin=1.9 * cm,
            title="Centro Médico San Benito José",
            author="TurtleLite",
        )

        def on_page(canvas, doc_):
            canvas.saveState()
            # encabezado
            canvas.setFont(SANS_B, 8)
            canvas.setFillColor(colors.HexColor("#6B7280"))
            canvas.drawString(2.2 * cm, letter[1] - 1.4 * cm, self.header_left)
            canvas.drawRightString(letter[0] - 2.2 * cm, letter[1] - 1.4 * cm, self.header_right)
            canvas.setStrokeColor(colors.HexColor("#D1D5DB"))
            canvas.setLineWidth(0.6)
            canvas.line(2.2 * cm, letter[1] - 1.65 * cm, letter[0] - 2.2 * cm, letter[1] - 1.65 * cm)
            canvas.restoreState()

        doc.build(self.story, onFirstPage=on_page, onLaterPages=on_page,
                  canvasmaker=partial(_PagedCanvas, version=self.version))

    # -- ayudas de contenido --
    def h1(self, text):
        self.story.append(Paragraph(text, st_h1))

    def h2(self, text):
        self.story.append(Paragraph(text, st_h2))

    def body(self, text):
        self.story.append(Paragraph(text, st_body))

    def note(self, text):
        self.story.append(Paragraph(text, st_note))

    def bullet(self, text):
        self.story.append(Paragraph(text, st_bullet, bulletText="•"))

    def numbered(self, text):
        self.story.append(Paragraph(text, st_num))

    def quote(self, text):
        self.story.append(Paragraph(text, st_quote))

    def spacer(self, h=0.4):
        self.story.append(Spacer(1, h * cm))

    def pagebreak(self):
        self.story.append(PageBreak())

    def table(self, rows, col_widths=None, header=True, center_cols=(), grid=True, row_heights=None):
        data = []
        for r in rows:
            row = []
            for j, c in enumerate(r):
                if header and len(data) == 0:
                    cell_style = st_table_head
                elif j in center_cols:
                    cell_style = st_table_cell_c
                else:
                    cell_style = st_table_cell
                row.append(Paragraph(str(c), cell_style))
            data.append(row)
        style = [
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]
        if grid:
            style += [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#6E7B91")) if header else None,
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F9FA")]),
            ]
        t = Table(data, colWidths=col_widths, repeatRows=1 if header else 0, rowHeights=row_heights)
        t.setStyle(TableStyle([s for s in style if s]))
        self.story.append(t)
        self.spacer(0.2)

    def cover(self, center_text, subtitle, version, elaborated):
        self.spacer(3.2)
        self.story.append(Paragraph(center_text, st_title))
        self.spacer(0.2)
        self.story.append(Paragraph(subtitle, st_subtitle))
        self.spacer(2.6)
        self.story.append(Paragraph("Manual de Usuario", st_title))
        self.spacer(0.5)
        self.story.append(Paragraph(elaborated, st_subtitle))
        self.spacer(1.2)
        self.story.append(Paragraph(f"Versión {version}", st_ver))
        self.story.append(Paragraph("Elaborado por TurtleLite", st_ver))
        self.pagebreak()

    def legal_cover(self, title_lines, version):
        self.spacer(2.8)
        self.story.append(Paragraph(title_lines[0], st_title))
        self.spacer(0.6)
        for line in title_lines[1:]:
            self.story.append(Paragraph(line, st_subtitle))
        self.spacer(2.2)
        self.story.append(Paragraph(f"Versión {version}", st_ver))
        self.story.append(Paragraph("Documento confidencial", st_ver))
        self.pagebreak()


# ---------------------------------------------------------------------------
# Contenido: Manual de Usuario - Dirección
# ---------------------------------------------------------------------------
ROLE_TABLE = [
    ["Rol", "Descripción", "Alcance general"],
    ["Administrador", "Gestiona usuarios, sesiones, auditoría, especialidades y localidades. Consulta expedientes, pero no los crea, edita, elimina ni exporta.", "Usuarios, sesiones, auditoría, especialidades y localidades."],
    ["Dirección", "Consulta y gestiona expedientes (crear, editar, eliminar), reportes, listados diarios y estatus de cirugía.", "Expedientes, reportes, listados y estatus."],
    ["Dirección Médica", "Gestiona expedientes, reportes, listados diarios y estatus de cirugía.", "Expedientes, reportes, listados y estatus."],
    ["Médico", "Crea y edita sus propios expedientes y exporta expedientes a Excel. No los elimina.", "Expedientes propios y exportación."],
    ["Carga Px", "Crea expedientes y escribe el Nombre del Médico a mano (campo libre). Solo edita los expedientes que él mismo creó; no elimina, ni exporta, ni cambia el estatus de cirugía.", "Captura de expedientes."],
]

PERMISSION_MATRIX = [
    ["Función", "Administrador", "Dirección", "Dirección Médica", "Médico", "Carga Px"],
    ["Consultar expedientes", "Sí", "Sí", "Sí", "Sí", "Sí"],
    ["Crear expedientes", "No", "Sí", "Sí", "Sí", "Sí"],
    ["Editar expedientes propios", "No", "Sí", "Sí", "Sí", "Sí"],
    ["Editar expedientes de otros", "No", "Sí", "Sí", "No", "No"],
    ["Eliminar expedientes", "No", "Sí", "Sí", "No", "No"],
    ["Exportar expedientes a Excel", "Sí", "Sí", "Sí", "Sí", "No"],
    ["Vista previa del expediente", "Sí", "Sí", "Sí", "Sí", "Sí"],
    ["Reportes (crear, generar, descargar, eliminar)", "No", "Sí", "Sí", "No", "No"],
    ["Listado diario de cirugías (armar y guardar)", "No", "Sí", "Sí", "No", "No"],
    ["Estatus de cirugía (asignar y cambiar)", "No", "Sí", "Sí", "No", "No"],
    ["Usuarios (crear, editar, eliminar, desbloquear, restablecer)", "Sí", "No", "No", "No", "No"],
    ["Sesiones (ver y cerrar)", "Sí", "No", "No", "No", "No"],
    ["Auditoría (historial de actividades)", "Sí", "No", "No", "No", "No"],
    ["Especialidades y localidades (crear, editar, eliminar)", "Sí", "No", "No", "No", "No"],
    ["Mi Perfil (datos y contraseña)", "Sí", "Sí", "Sí", "Sí", "Sí"],
]

INTRO = [
    ("h1", "1. Introducción y acceso al sistema"),
    ("h2", "1.1. ¿Qué es el sistema?"),
    ("body", "El Sistema Web de Gestión de Expedientes Médicos es la plataforma oficial del Centro Médico San Benito José. Permite registrar y consultar los expedientes de los pacientes, generar reportes en Excel, armar el listado diario de cirugías y gestionar el estatus de cada cirugía, todo desde el navegador y de forma centralizada."),
    ("h2", "1.2. Roles del sistema"),
    ("body", "Cada usuario pertenece a un rol que determina las funciones que puede realizar. Los roles son los siguientes:"),
    ("table", ROLE_TABLE, [3.6 * cm, 8.4 * cm, 4.0 * cm]),
    ("note", "Nota: Su rol es {rol}. Las secciones de este manual describen únicamente lo que su rol puede hacer."),
    ("body", "El menú y las secciones del sistema son los mismos para todos los usuarios. Lo que cambia es la autorización: el sistema valida su rol al acceder a cada sección y, si no tiene permiso, muestra el mensaje \"No tienes acceso\" y no abre la página."),
    ("h2", "1.2.1. Permisos por rol"),
    ("body", "La siguiente tabla resume, para cada función del sistema, qué roles pueden realizarla. Localice la columna de su rol para conocer sus permisos exactos."),
    ("table", PERMISSION_MATRIX, [6.0 * cm, 2.8 * cm, 2.9 * cm, 2.9 * cm, 2.6 * cm]),
    ("h2", "1.3. Requisitos para usar el sistema"),
    ("bullet", "Un navegador actualizado (Google Chrome, Microsoft Edge o Firefox)."),
    ("bullet", "Conexión a internet estable."),
    ("bullet", "Un usuario y contraseña asignados por el administrador del sistema."),
    ("h2", "1.4. Inicio de sesión (paso a paso)"),
    ("numbered", "1. Abra el navegador y vaya a la dirección: <b>https://sistema-web-expedientes-cmsbj.onrender.com/</b>"),
    ("numbered", "2. En la pantalla de inicio, escriba su nombre de usuario en el campo \"Usuario\"."),
    ("numbered", "3. Escriba su contraseña en el campo correspondiente."),
    ("numbered", "4. Presione el botón <b>Iniciar sesión</b>."),
    ("numbered", "5. El sistema lo llevará al Inicio, donde verá las tarjetas de acceso a las secciones del sistema."),
    ("note", "Nota: Si los datos son incorrectos, el sistema mostrará un mensaje de error en rojo. Verifique que no haya espacios o mayúsculas adicionales."),
    ("h2", "1.5. Seguridad de la sesión"),
    ("bullet", "La contraseña es personal e intransferible."),
    ("bullet", "Cierre sesión con el botón <b>Cerrar sesión</b> del menú lateral cuando termine su jornada."),
    ("bullet", "No comparta su sesión con otros usuarios, ni siquiera temporalmente."),
    ("h2", "1.6. Instalación de la aplicación"),
    ("body", "El programa se encuentra en la barra de tareas de cada tablet."),
]

INTERFACE = [
    ("h1", "2. La interfaz del sistema"),
    ("h2", "2.1. El menú lateral"),
    ("body", "Al iniciar sesión verá el menú lateral (lado izquierdo), el encabezado con el nombre del centro médico y su rol, y el área de trabajo donde se muestran las secciones."),
    ("body", "El menú lateral es el mismo para todos los usuarios: Inicio, Mi Perfil, Expedientes, Reportes, Listados, Estatus, Usuarios, Sesiones y Auditoría."),
    ("bullet", "Las secciones para las que su rol tiene permiso abren directamente al seleccionarlas."),
    ("bullet", "Las secciones restringidas se ven igual en el menú, pero el sistema valida su rol al seleccionarlas."),
    ("note", "Nota: Si usted no tiene permiso para una sección, al seleccionarla el sistema muestra el mensaje \"No tienes acceso a [sección]\" y no abrirá la página. Su rol determina qué funciones puede realizar."),
    ("h2", "2.2. El encabezado"),
    ("body", "En la parte superior se muestra el nombre del centro médico y, a la derecha, una etiqueta con su rol (Administrador, Dirección, Dirección Médica o Médico). En la esquina inferior derecha aparece la Versión del sistema como referencia."),
    ("h2", "2.3. Su perfil y cierre de sesión"),
    ("bullet", "Abajo del menú lateral aparece su nombre y rol; haga clic en su nombre para ir a Mi Perfil."),
    ("bullet", "Use el botón <b>Cerrar sesión</b> para salir del sistema de forma segura."),
]

PROFILE = [
    ("h1", "Mi Perfil (disponible para todos los roles)"),
    ("body", "La sección Mi Perfil le permite mantener sus datos al día. Procedimiento:"),
    ("numbered", "1. Haga clic en su nombre (abajo del menú lateral) o en el menú en Mi Perfil."),
    ("numbered", "2. En Título seleccione Dr., Dra., Lic. o \"Sin título\"."),
    ("numbered", "3. Escriba sus nombres y apellidos (el sistema los capitaliza automáticamente)."),
    ("numbered", "4. En Teléfono escriba el número con el formato 0000-0000 (cuatro dígitos, guion, cuatro dígitos). El sistema le inserta el guion automáticamente."),
    ("numbered", "5. Si desea cambiar la contraseña: escriba la contraseña actual y la nueva contraseña. Si no la va a cambiar, deje ambos campos vacíos."),
    ("numbered", "6. Presione <b>Guardar cambios</b>. Verá la confirmación \"Perfil actualizado correctamente\"."),
    ("note", "Nota: El usuario (nombre de usuario) no puede cambiarse desde el perfil; solo el administrador puede crear o modificar usuarios."),
]

RECOMMEND = [
    ("h1", "Recomendaciones y soporte"),
    ("h2", "Buenas prácticas"),
    ("bullet", "Registre los expedientes con datos completos y verificados: identidad, nombre, diagnóstico y especialidad."),
    ("bullet", "Revise los datos antes de guardar: los cambios se aplican de forma inmediata."),
    ("bullet", "Verifique antes de guardar que no exista otro expediente con la misma identidad; de ser así, unifique o corrija los registros para mantener la base limpia."),
    ("bullet", "Cierre sesión al terminar, especialmente si comparte el equipo."),
    ("h2", "Soporte"),
    ("bullet", "Ante cualquier error o duda, comuníquese con el administrador del sistema."),
    ("bullet", "Indique el paso que estaba realizando y el mensaje mostrado para agilizar la atención."),
]

# ---------------------------------------------------------------------------
# Manuales por rol
# ---------------------------------------------------------------------------
def manual_direccion(out_dir, version="1.0"):
    b = DocBuilder(os.path.join(out_dir, "Manual_Usuario_Direccion.pdf"),
                   "Centro Médico San Benito José - Sistema Web de Gestión de Expedientes",
                   "Manual de Usuario - Dirección", version)
    b.cover("CENTRO MÉDICO SAN BENITO JOSÉ", "Sistema Web de Gestión de Expedientes Médicos", version, "Dirección")
    emit(b, INTRO, rol="Dirección")
    emit(b, INTERFACE)

    b.h1("3. Funciones a las que SÍ tiene acceso, en detalle")
    b.h2("3.1. Inicio (panel principal)")
    b.body("Muestra un saludo con la fecha y la hora del día, y las tarjetas de acceso a las secciones del sistema (Mi Perfil, Expedientes, Reportes, Listados y Estatus para su rol). Cada tarjeta lo lleva a la sección correspondiente.")

    b.h2("3.2. Expedientes (gestión completa)")
    b.body("Su rol puede crear, consultar, editar y eliminar expedientes.")
    b.h2("Buscar un expediente")
    b.numbered("1. En el menú lateral haga clic en <b>Expedientes</b>.")
    b.numbered("2. En el campo <b>Buscar...</b> escriba nombre, apellido, identidad, número de expediente, diagnóstico, especialidad o perfil.")
    b.numbered("3. El sistema busca automáticamente mientras escribe; no distingue mayúsculas ni tildes (ej.: \"lopez\" encuentra \"López\").")
    b.h2("Filtrar por especialidad")
    b.numbered("1. En el selector \"Todas las especialidades\" elija una (ej.: Oftalmología).")
    b.numbered("2. La lista se filtra al instante; el contador superior muestra la cantidad de expedientes.")
    b.h2("Crear un expediente")
    b.numbered("1. Presione el botón <b>Nuevo</b>.")
    b.numbered("2. Complete el formulario: identidad, nombre, apellido, edad, sexo, domicilio, teléfono, diagnóstico, especialidad, perfil y criticidad clínica, entre otros.")
    b.numbered("3. Escriba el Nº de expediente a mano en el campo correspondiente (solo números). Si ese número ya existe en el sistema, este lo guardará como copia con un sufijo entre paréntesis (ej.: 23455 (1), 23455 (2)...) y pedirá confirmar que será una nueva intervención del paciente.")
    b.numbered("4. En la sección <b>Signos Vitales</b> escriba el Peso (kg) y la Talla en metros. El sistema calcula automáticamente el <b>B.M.I.</b> (peso ÷ talla²) mientras usted escribe; el campo B.M.I. es de solo lectura. Al escribir la talla, el punto decimal se coloca solo (ej.: digite 184 y se mostrará 1.84 mts).")
    b.numbered("5. Presione <b>Crear Expediente</b>. El expediente queda registrado inmediatamente.")
    b.h2("Editar un expediente")
    b.numbered("1. Marque la casilla del expediente a corregir.")
    b.numbered("2. Presione <b>Editar</b>, modifique los datos necesarios y presione <b>Guardar Cambios</b>.")
    b.h2("Eliminar expedientes")
    b.numbered("1. Marque uno o varios expedientes.")
    b.numbered("2. Presione <b>Eliminar</b> y confirme la operación.")
    b.note("Nota: La eliminación es definitiva. Revise siempre antes de confirmar.")
    b.h2("Exportar expedientes a Excel")
    b.numbered("1. Seleccione uno o varios expedientes con las casillas.")
    b.numbered("2. Presione <b>Exportar [n] seleccionados</b>. El sistema descarga el archivo Excel con los expedientes marcados.")
    b.h2("Vista previa del expediente")
    b.numbered("1. Marque la casilla del expediente que desea consultar.")
    b.numbered("2. Presione <b>Vista previa</b> (aparece en la barra de selección junto a Editar/Eliminar) para consultar el expediente completo sin abrirlo en edición.")

    b.h2("3.3. Reportes")
    b.body("Los reportes son archivos Excel con información de los expedientes, útiles para estadísticas y seguimientos.")
    b.h2("Crear un reporte")
    b.numbered("1. En el menú haga clic en <b>Reportes</b> y luego en <b>Nuevo Reporte</b>.")
    b.numbered("2. Escriba un nombre descriptivo (ej.: \"Cirugías reprogramadas\").")
    b.numbered("3. Opcional: filtre por especialidad, perfil, criticidad clínica (Baja, Media o Alta) o estatus de cirugía.")
    b.numbered("4. Guarde el reporte.")
    b.h2("Ver la vista previa")
    b.numbered("1. Con el botón <b>Vista previa</b> revise los registros que incluirá el reporte.")
    b.numbered("2. Puede arrastrar las filas para acomodar la posición: la columna <b>No</b> se renumera automáticamente según el nuevo orden (el primer registro pasa a ser 1, el segundo 2, y así sucesivamente).")
    b.numbered("3. Verifique que la información sea la esperada antes de generar el archivo.")
    b.h2("Generar y descargar el Excel")
    b.numbered("1. Presione <b>Generar Excel</b>. El sistema crea el archivo con el nombre \"REPORTE_\", seguido del nombre del reporte (ej.: REPORTE_Cirugias_reprogramadas.xlsx).")
    b.numbered("2. Use <b>Descargar</b> para guardar el archivo en su equipo.")
    b.note("Nota: La columna \"Observación\" solo aparece en los reportes.")
    b.h2("Eliminar un reporte")
    b.numbered("1. Use el botón de eliminar del reporte y confirme. El reporte y su archivo se eliminan.")

    b.h2("3.4. Listado Diario de Cirugías")
    b.body("Permite armar el listado de cirugías de cada fecha, que luego se exporta a Excel.")
    b.numbered("1. Vaya a <b>Listados</b> en el menú.")
    b.numbered("2. Elija la fecha con el selector de fecha o las flechas (el botón \"Hoy\" vuelve al día actual).")
    b.numbered("3. En el panel izquierdo (disponibles), busque al paciente y agréguelo con el botón \"+\". Puede filtrar por estatus de cirugía (\"En espera\" por defecto, Reprogramar, Cancelado, No se presentó o todos).")
    b.numbered("4. Arrastre a cada paciente para reordenarlo dentro de su especialidad.")
    b.numbered("5. Presione <b>Guardar</b> para guardar el listado y <b>Excel</b> para descargarlo. Use <b>Vaciar</b> para eliminar el listado de esa fecha.")

    b.h2("3.5. Estatus Cirugía")
    b.body("Módulo para controlar el estado de cada cirugía programada.")
    b.h2("Revisar los estatus")
    b.numbered("1. En el menú haga clic en <b>Estatus Cirugía</b>.")
    b.numbered("2. Use el filtro de estatus si desea ver solo un grupo (ej.: \"En espera\").")
    b.h2("Cambiar el estatus de una cirugía")
    b.numbered("1. Localice el expediente en la tabla.")
    b.numbered("2. En la columna de estatus, seleccione el nuevo estado: En espera, Reprogramar, Cancelado, Fuera de perfil San Benito, Operado, No apto para cirugía o No se presentó.")
    b.numbered("3. Puede escribir una observación que quedará registrada en el expediente.")
    b.numbered("4. Presione <b>Guardar</b>. El cambio queda registrado en el expediente.")

    emit(b, PROFILE)

    b.h1("Funciones a las que NO tiene acceso")
    b.body("El menú lateral es el mismo para todos los usuarios, pero su rol no incluye las funciones de la siguiente tabla. Si intenta ingresar a esas secciones, el sistema mostrará el mensaje \"No tienes acceso\" y no abrirá la página:")
    b.table([
        ["Función / Módulo", "Disponible para", "Comportamiento con su rol"],
        ["Usuarios (crear, editar, eliminar, restablecer)", "Solo Administrador", "Mensaje \"No tienes acceso\"."],
        ["Sesiones (ver y cerrar sesiones)", "Solo Administrador", "Mensaje \"No tienes acceso\"."],
        ["Auditoría (historial de actividades)", "Solo Administrador", "Mensaje \"No tienes acceso\"."],
        ["Administrar especialidades y localidades", "Solo Administrador", "Los botones no están disponibles."],
        ["Cambiar contraseñas de otros usuarios", "Solo Administrador", "Mensaje \"No tienes acceso\"."],
    ], [5.6 * cm, 4.4 * cm, 5.0 * cm])
    b.spacer(0.3)
    b.h1("Preguntas frecuentes")
    b.quote("¿Puedo crear un expediente nuevo?")
    b.body("Sí. Su rol puede crear, editar y eliminar expedientes.")
    b.quote("¿Puedo editar los datos de un paciente?")
    b.body("Sí. Marque el expediente y presione Editar.")
    b.quote("¿Puedo cambiar el estatus de cirugía?")
    b.body("Sí. Use la sección Estatus Cirugía.")
    b.quote("¿Puedo descargar un reporte sin generarlo antes?")
    b.body("No. Primero debe presionar \"Generar Excel\"; luego aparece disponible el botón \"Descargar\".")
    b.quote("¿Se mueve la columna No al reordenar el reporte?")
    b.body("Sí. Los números (1, 2, 3...) indican la posición del registro en el reporte y se actualizan automáticamente al arrastrar: el registro que queda primero pasa a ser 1, el segundo 2, y así sucesivamente.")

    emit(b, RECOMMEND)
    b.build()


def manual_direccion_medica(out_dir, version="1.0"):
    b = DocBuilder(os.path.join(out_dir, "Manual_Usuario_Direccion_Medica.pdf"),
                   "Centro Médico San Benito José - Sistema Web de Gestión de Expedientes",
                   "Manual de Usuario - Dirección Médica", version)
    b.cover("CENTRO MÉDICO SAN BENITO JOSÉ", "Sistema Web de Gestión de Expedientes Médicos", version, "Dirección Médica")
    emit(b, INTRO, rol="Dirección Médica")
    emit(b, INTERFACE)

    b.h1("3. Funciones a las que SÍ tiene acceso, en detalle")
    b.h2("3.1. Inicio (panel principal)")
    b.body("Muestra un saludo con la fecha y la hora del día, y las tarjetas de acceso a las secciones del sistema (Mi Perfil, Expedientes, Reportes, Listados y Estatus para su rol). Cada tarjeta lo lleva a la sección correspondiente.")

    b.h2("3.2. Expedientes (gestión completa)")
    b.body("Buscar y filtrar")
    b.numbered("1. Haga clic en <b>Expedientes</b> en el menú lateral.")
    b.numbered("2. Use <b>Buscar...</b> (no distingue mayúsculas ni tildes) o el filtro de especialidad.")
    b.numbered("3. La lista carga de 50 en 50; deslice hasta el final para cargar más expedientes.")
    b.body("Crear un expediente")
    b.numbered("1. Presione el botón <b>Nuevo</b>.")
    b.numbered("2. Complete el formulario: identidad, nombre, apellido, edad, sexo, domicilio, teléfono, diagnóstico, especialidad, perfil y criticidad clínica (Baja, Media o Alta), entre otros campos. Escriba el Nº de expediente a mano (solo números); si el número ya existe, el sistema lo guarda como copia (ej.: 23455 (1)) y pide confirmar que será una nueva intervención antes de guardar.")
    b.numbered("3. En la sección <b>Signos Vitales</b> escriba el Peso (kg) y la Talla en metros: el B.M.I. se calcula automáticamente (peso ÷ talla²) y es de solo lectura; al escribir la talla, el punto decimal se coloca solo (ej.: digite 184 y se mostrará 1.84 mts).")
    b.numbered("4. Presione <b>Crear Expediente</b>. El expediente queda registrado inmediatamente.")
    b.note("Nota: Verifique la identidad y los datos del paciente antes de guardar.")
    b.body("Editar un expediente")
    b.numbered("1. Marque la casilla del expediente a corregir.")
    b.numbered("2. Presione <b>Editar</b>, modifique los datos necesarios y presione <b>Guardar Cambios</b>.")
    b.body("Eliminar expedientes")
    b.numbered("1. Marque uno o varios expedientes.")
    b.numbered("2. Presione <b>Eliminar</b> y confirme la operación.")
    b.note("Nota: La eliminación es definitiva. Revise siempre antes de confirmar.")
    b.body("Exportar a Excel")
    b.numbered("1. Marque con las casillas los expedientes que desea exportar.")
    b.numbered("2. Presione <b>Exportar [n] seleccionados</b>: el sistema descarga el archivo Excel con los expedientes marcados.")

    b.h2("3.3. Reportes")
    b.body("Crear un reporte")
    b.numbered("1. Vaya a <b>Reportes</b> → <b>Nuevo Reporte</b>.")
    b.numbered("2. Asigne nombre y, opcionalmente, filtre por especialidad, perfil, criticidad clínica o estatus de cirugía.")
    b.numbered("3. Guarde el reporte.")
    b.body("Generar, descargar y eliminar")
    b.numbered("1. <b>Vista previa:</b> revise los registros incluidos. Puede arrastrar filas para acomodar la posición; la columna <b>No</b> se renumera automáticamente según el nuevo orden.")
    b.numbered("2. <b>Generar Excel:</b> crea el archivo REPORTE_&lt;nombre del reporte&gt;.xlsx (ej.: REPORTE_Cirugias_reprogramadas.xlsx).")
    b.numbered("3. <b>Descargar:</b> guarda el archivo en su equipo.")
    b.numbered("4. <b>Eliminar:</b> borra reportes que ya no necesite.")
    b.note("Nota: La columna \"Observación\" solo aparece en los reportes.")

    b.h2("3.4. Listado Diario de Cirugías")
    b.body("Permite armar el listado de cirugías de cada fecha, que luego se exporta a Excel.")
    b.numbered("1. Vaya a <b>Listados</b> en el menú.")
    b.numbered("2. Elija la fecha con el selector de fecha o las flechas (el botón \"Hoy\" vuelve al día actual).")
    b.numbered("3. En el panel izquierdo (disponibles), busque al paciente; el filtro de estatus muestra \"En espera\" por defecto, o puede elegir Reprogramar, Cancelado, No se presentó o todos.")
    b.numbered("4. Agregue el paciente con el botón \"+\". Se ubica en la sección de su especialidad.")
    b.numbered("5. Arrastre a cada paciente con la manija (ícono de agarre) para reordenarlo dentro de su especialidad.")
    b.numbered("6. <b>Guardar:</b> guarda el listado de la fecha. <b>Excel:</b> descarga LISTADO_fecha.xlsx. <b>Vaciar:</b> elimina el listado de esa fecha.")

    b.h2("3.5. Estatus Cirugía")
    b.body("Módulo para controlar el estado de cada cirugía programada.")
    b.numbered("1. En el menú haga clic en <b>Estatus Cirugía</b>.")
    b.numbered("2. Use el filtro de estatus si desea ver solo un grupo.")
    b.numbered("3. En la columna de estatus, seleccione el nuevo estado y escriba una observación si lo desea.")
    b.numbered("4. Presione <b>Guardar</b>. El cambio queda registrado en el expediente.")

    emit(b, PROFILE)

    b.h1("Funciones a las que NO tiene acceso")
    b.body("El menú lateral es el mismo para todos los usuarios, pero su rol no incluye las funciones de la siguiente tabla. Si intenta ingresar a esas secciones, el sistema mostrará el mensaje \"No tienes acceso\" y no abrirá la página:")
    b.table([
        ["Función / Módulo", "Disponible para", "Comportamiento con su rol"],
        ["Usuarios (crear, editar, eliminar, restablecer)", "Solo Administrador", "Mensaje \"No tienes acceso\"."],
        ["Sesiones (ver y cerrar sesiones)", "Solo Administrador", "Mensaje \"No tienes acceso\"."],
        ["Auditoría (historial de actividades)", "Solo Administrador", "Mensaje \"No tienes acceso\"."],
        ["Administrar especialidades y localidades", "Solo Administrador", "Los botones no están disponibles."],
        ["Cambiar contraseñas de otros usuarios", "Solo Administrador", "Mensaje \"No tienes acceso\"."],
    ], [5.6 * cm, 4.4 * cm, 5.0 * cm])
    b.spacer(0.3)
    b.h1("Preguntas frecuentes")
    b.quote("¿Puedo cambiar el estatus de cirugía de un paciente?")
    b.body("Sí. Su rol puede asignar y cambiar el estatus de cirugía desde la sección Estatus Cirugía.")
    b.quote("¿Puedo editar un expediente creado por un médico?")
    b.body("Sí. La Dirección Médica puede editar y eliminar cualquier expediente.")
    b.quote("¿Puedo guardar el listado de un día sin completarlo?")
    b.body("Sí, puede guardarlo en cualquier momento y continuar más tarde; al volver a la fecha, el listado se recupera tal como lo dejó.")
    b.quote("¿El reporte se actualiza solo?")
    b.body("No. Si cambian los expedientes, debe presionar \"Generar Excel\" de nuevo para actualizar el archivo.")
    b.quote("¿Se mueve la columna No al reordenar el reporte?")
    b.body("Sí. Los números (1, 2, 3...) indican la posición del registro en el reporte y se actualizan automáticamente al arrastrar: el registro que queda primero pasa a ser 1, el segundo 2, y así sucesivamente.")

    emit(b, RECOMMEND)
    b.build()


def manual_medico(out_dir, version="1.0"):
    b = DocBuilder(os.path.join(out_dir, "Manual_Usuario_Medico.pdf"),
                   "Centro Médico San Benito José - Sistema Web de Gestión de Expedientes",
                   "Manual de Usuario - Médico", version)
    b.cover("CENTRO MÉDICO SAN BENITO JOSÉ", "Sistema Web de Gestión de Expedientes Médicos", version, "Médico")
    emit(b, INTRO, rol="Médico")
    emit(b, INTERFACE)

    b.h1("3. Funciones a las que SÍ tiene acceso, en detalle")
    b.h2("3.1. Inicio (panel principal)")
    b.body("Muestra un saludo con la fecha y la hora del día, y las tarjetas de acceso a las secciones del sistema. Para su rol están habilitadas Mi Perfil y Expedientes; al seleccionar cualquier otra tarjeta, el sistema muestra el mensaje \"No tienes acceso\".")

    b.h2("3.2. Expedientes")
    b.body("Consultar expedientes")
    b.numbered("1. Haga clic en <b>Expedientes</b> en el menú lateral.")
    b.numbered("2. Busque con el campo <b>Buscar...</b>: no distingue mayúsculas ni tildes (busca en nombre, apellido, identidad, expediente, diagnóstico, especialidad y perfil).")
    b.numbered("3. Filtre por especialidad si necesita un grupo específico.")
    b.numbered("4. La lista carga de 50 en 50; deslice hacia abajo para cargar más.")
    b.body("Crear un expediente")
    b.numbered("1. Presione el botón <b>Nuevo</b>.")
    b.numbered("2. Complete el formulario con los datos del paciente (identidad, nombre, apellido, edad, sexo, domicilio, teléfono, diagnóstico, especialidad, perfil y criticidad clínica, entre otros). Escriba el Nº de expediente a mano (solo números); si el número ya existe, el sistema lo guarda como copia (ej.: 23455 (1)) y pregunta confirmar que será una nueva intervención antes de guardar.")
    b.numbered("3. En la sección <b>Signos Vitales</b> escriba el Peso (kg) y la Talla en metros: el B.M.I. se calcula automáticamente (peso ÷ talla²) y es de solo lectura; al escribir la talla, el punto decimal se coloca solo (ej.: digite 184 y se mostrará 1.84 mts).")
    b.numbered("4. Presione <b>Crear Expediente</b>. El expediente queda registrado a su nombre.")
    b.note("Nota: Verifique la identidad y los datos antes de guardar: solo puede editar los expedientes que usted creó, y no puede eliminarlos ni cambiar el estatus de cirugía.")
    b.body("Editar un expediente propio")
    b.numbered("1. Marque la casilla del expediente que usted creó.")
    b.numbered("2. Presione <b>Editar</b>, haga las correcciones y presione <b>Guardar Cambios</b>.")
    b.note("Nota: Solo puede editar los expedientes que usted mismo creó. Para los expedientes de otros médicos, la opción <b>Editar</b> no está disponible.")
    b.body("Exportar expedientes")
    b.numbered("1. Marque con las casillas los expedientes que desea exportar.")
    b.numbered("2. Presione <b>Exportar [n] seleccionados</b>: el sistema descarga el archivo Excel con los expedientes marcados.")

    emit(b, PROFILE)

    b.h1("Funciones a las que NO tiene acceso")
    b.body("El menú lateral es el mismo para todos los usuarios, pero su rol no incluye las funciones de la siguiente tabla. Si intenta ingresar a esas secciones, el sistema mostrará el mensaje \"No tienes acceso\" y no abrirá la página:")
    b.table([
        ["Función / Módulo", "Disponible para", "Comportamiento con su rol"],
        ["Usuarios (crear, editar, eliminar, restablecer)", "Solo Administrador", "Mensaje \"No tienes acceso\"."],
        ["Sesiones (ver y cerrar sesiones)", "Solo Administrador", "Mensaje \"No tienes acceso\"."],
        ["Auditoría (historial de actividades)", "Solo Administrador", "Mensaje \"No tienes acceso\"."],
        ["Reportes (crear, generar, descargar, eliminar)", "Dirección y Dirección Médica", "Mensaje \"No tienes acceso\"."],
        ["Listado Diario de Cirugías (armar y guardar)", "Dirección y Dirección Médica", "Mensaje \"No tienes acceso\"."],
        ["Estatus Cirugía (asignar/cambiar estatus)", "Dirección y Dirección Médica", "Mensaje \"No tienes acceso\"."],
        ["Editar expedientes de otros médicos", "Solo su propio creador", "La opción Editar no está disponible."],
        ["Eliminar expedientes", "Dirección y Dirección Médica", "El botón no está disponible."],
        ["Cambiar el estatus de cirugía de un expediente", "Dirección y Dirección Médica", "El sistema rechaza el cambio."],
        ["Administrar especialidades y localidades", "Solo Administrador", "Los botones no están disponibles."],
        ["Cambiar contraseñas de otros usuarios", "Solo Administrador", "Mensaje \"No tienes acceso\"."],
    ], [5.6 * cm, 4.4 * cm, 5.0 * cm])
    b.spacer(0.3)
    b.h1("Preguntas frecuentes")
    b.quote("¿Puedo editar un expediente que creó otro médico?")
    b.body("No. Solo puede editar los expedientes que usted creó. Para corregir un expediente de otro médico, comuníquese con la Dirección Médica o la Dirección.")
    b.quote("¿Puedo eliminar un expediente?")
    b.body("No. La eliminación de expedientes corresponde a la Dirección y la Dirección Médica.")
    b.quote("¿Por qué veo Reportes o Listados en mi menú pero no puedo abrirlos?")
    b.body("El menú es igual para todos los usuarios. Esos módulos son de la Dirección y la Dirección Médica; al seleccionarlos, su rol ve el mensaje \"No tienes acceso\".")
    b.quote("¿Puedo cambiar el estatus de cirugía?")
    b.body("No. El estatus de cirugía solo lo cambian la Dirección y la Dirección Médica.")
    b.quote("¿Qué hago si cometí un error al crear un expediente?")
    b.body("Si el expediente es suyo, puede editarlo. Si necesita eliminarlo o corregir un expediente de otro médico, solicite la ayuda a la Dirección Médica.")
    b.quote("¿El teléfono es obligatorio en el perfil?")
    b.body("Sí, junto con el nombre completo. El formato es 0000-0000 y el sistema valida que lo cumpla.")

    emit(b, RECOMMEND)
    b.build()


def emit(b, items, **fmt):
    for it in items:
        kind = it[0]
        if kind == "h1":
            b.h1(it[1].format(**fmt))
        elif kind == "h2":
            b.h2(it[1].format(**fmt))
        elif kind == "body":
            b.body(it[1].format(**fmt))
        elif kind == "note":
            b.note(it[1].format(**fmt))
        elif kind == "bullet":
            b.bullet(it[1].format(**fmt))
        elif kind == "numbered":
            b.numbered(it[1].format(**fmt))
        elif kind == "quote":
            b.quote(it[1].format(**fmt))
        elif kind == "table":
            b.table(it[1], it[2])


# ---------------------------------------------------------------------------
# Acuerdo Marco
# ---------------------------------------------------------------------------
def acuerdo_marco(out_dir, version="1.0"):
    b = DocBuilder(os.path.join(out_dir, "Acuerdo_Marco_Sistema_Expedientes_SBJ.pdf"),
                   "Centro Médico San Benito José",
                   "Documento legal - Sistema de Expedientes", version)
    b.legal_cover([
        "CENTRO MÉDICO SAN BENITO JOSÉ",
        "Acuerdo Marco y Anexo de Protección de Datos",
        "Desarrollo, Titularidad y Uso del Sistema Web de Gestión de Expedientes Médicos",
    ], version)

    b.h1("Introducción")
    b.body("El presente documento formaliza la relación entre el Centro Médico San Benito José (en adelante, \"el Centro\") y TurtleLite (en adelante, \"el Desarrollador\") respecto del Sistema Web de Gestión de Expedientes Médicos y del tratamiento de los datos personales de salud que el sistema administra.")

    b.h1("PARTE I - Contrato de desarrollo y cesión de derechos")
    b.h2("Artículo 1. Partes")
    b.body("1.1 Contratante: Centro Médico San Benito José, con domicilio en Comayagua, Honduras, frente al Convento de las Hermanas Clarisas, representado legalmente por Alexander James Scheibner, portador(a) de carnet de residencia en Honduras número 01-1812-2019-02366.")
    b.body("1.2 Desarrollador: TurtleLite, persona natural, representado por Amed Enmanuel Canales Mejía, portador(a) de identidad 0318-2008-01133.")

    b.h2("Artículo 2. Objeto")
    b.body("2.1 El Desarrollador ha construido y entregado el Sistema Web de Gestión de Expedientes Médicos (sitio web, aplicación de backend, base de datos y documentación), que registra y administra expedientes de pacientes con un número de expediente en formato numérico registrado manualmente por el personal; si se ingresa un número ya existente, el sistema lo conserva como copia identificada (ej.: 23455 (1)) previa confirmación; asigna criticidad clínica (Baja, Media o Alta); desglosa el domicilio por departamento, municipio y localidad (Aldea, Barrio, Colonia o Caserío); busca sin distinción de mayúsculas ni tildes; genera reportes exportables a Excel con reordenamiento de filas (la columna No se actualiza automáticamente según la nueva posición); y controla los listados diarios de cirugías y el estatus quirúrgico con observaciones.")
    b.body("2.2 El sistema administra usuarios con roles de acceso (Administrador, Dirección, Dirección Médica y Médico): el Administrador gestiona usuarios, sesiones, auditoría, especialidades y localidades, incluida la creación de nuevas especialidades y localidades desde la gestión de los expedientes (botones \"Nueva especialidad\" y \"Nueva localidad\", con indicación del tipo de localidad), que quedan disponibles de inmediato en los formularios del sistema, y únicamente consulta expedientes; la Dirección y la Dirección Médica gestionan expedientes, reportes, listados diarios de cirugías y el estatus quirúrgico; el Médico registra expedientes, edita únicamente los que él mismo creó, y puede visualizar y exportar expedientes. El menú y las secciones del sistema se muestran de forma uniforme a todos los usuarios; la autorización para cada función está controlada por el rol del usuario, de modo que el sistema valida el permiso al momento de acceder y, si el usuario no lo tiene, muestra el aviso de acceso no autorizado e impide abrir la función o sección correspondiente.")

    b.h2("Artículo 3. Titularidad del software")
    b.body("3.1 El Desarrollador cede al Centro el uso pleno, permanente e irrevocable del sistema y de su código fuente, con derecho a modificarlo, adaptarlo y desplegarlo en la infraestructura que el Centro elija.")
    b.body("3.2 El Desarrollador conserva el crédito de autoría (\"© TurtleLite\") en la interfaz y la documentación, sin limitar los derechos del Centro.")
    b.body("3.3 El Centro es el único responsable del uso del sistema y de las decisiones tomadas con base en la información que este administra.")

    b.h2("Artículo 4. Titularidad de los datos")
    b.body("4.1 Toda la información ingresada al sistema (expedientes, identidades, diagnósticos, listados y reportes) es propiedad exclusiva del Centro. El Desarrollador no la utilizará, reproducirá ni divulgará durante la vigencia del acuerdo ni con posterioridad a su terminación.")

    b.h2("Artículo 5. Confidencialidad (NDA)")
    b.body("5.1 El Desarrollador mantiene en estricta confidencialidad la información clínica de los pacientes, las credenciales y los detalles técnicos de la infraestructura, usándolos solo para cumplir el objeto del contrato, sin divulgación a terceros, salvo requerimiento de autoridad competente debidamente notificado o autorización escrita del Centro.")
    b.body("5.2 La obligación de confidencialidad subsiste de forma indefinida después de la terminación del acuerdo y se extiende a quienes presten servicios al Desarrollador.")

    b.h2("Artículo 6. Mantenimiento y soporte")
    b.body("6.1 El Desarrollador corregirá errores y aplicará actualizaciones mientras las partes lo pacten por escrito, y realizará toda edición del sistema, ya sea por corrección de errores o por nuevas funcionalidades.")

    b.h2("Artículo 7. Responsabilidades")
    b.body("7.1 El Desarrollador responde únicamente por errores de programación imputables al código entregado. El Centro es responsable de la veracidad y licitud de los datos ingresados y de mantener sus credenciales de acceso seguras y confidenciales.")

    b.h2("Artículo 8. Terminación y entrega")
    b.body("8.1 Al terminar la relación por cualquier causa, el Desarrollador entregará al Centro el código fuente actualizado y las cuentas donde funciona el sistema.")

    b.h2("Artículo 9. Vigencia")
    b.body("9.1 El presente acuerdo entra en vigencia a partir de la firma de ambas partes y permanece vigente mientras el Centro utilice el sistema.")

    b.h1("PARTE II - Anexo de protección de datos personales de salud")
    b.h2("Artículo 10. Base legal")
    b.body("10.1 El tratamiento de los expedientes se realiza conforme al derecho a la intimidad y al hábeas data (artículos 76 y 182 numeral 2 de la Constitución de la República de Honduras), al deber de secreto profesional del Código de Salud y a la Ley de Transparencia y Acceso a la Información Pública (Decreto 170-2006). Honduras está en proceso de adoptar una ley integral de protección de datos; las partes adoptan estándares internacionales equivalentes y se obligan a ajustar el tratamiento a dicha ley cuando sea aprobada.")

    b.h2("Artículo 11. Responsable del tratamiento")
    b.body("11.1 El responsable del tratamiento de los datos es el Centro. El Desarrollador actúa únicamente como encargado (administración técnica), con acceso restringido a la información.")

    b.h2("Artículo 12. Finalidad del tratamiento")
    b.body("12.1 Los datos de salud se recolectan exclusivamente para: el registro médico de los pacientes, la elaboración de expedientes y reportes estadísticos, los listados diarios de cirugías, la asignación de criticidad clínica y el seguimiento del estatus quirúrgico.")

    b.h2("Artículo 13. Principios aplicables")
    b.bullet("<b>Consentimiento:</b> los pacientes autorizan el registro de sus datos al momento de su atención.")
    b.bullet("<b>Finalidad:</b> los datos se usan únicamente para los fines declarados.")
    b.bullet("<b>Proporcionalidad:</b> solo se registran los datos estrictamente necesarios.")
    b.bullet("<b>Seguridad:</b> el acceso está limitado por roles con permisos específicos; las funciones se muestran a todos los usuarios, pero solo el rol autorizado puede ejecutarlas, y el acceso no autorizado se rechaza con el mensaje correspondiente.")
    b.bullet("<b>Confidencialidad:</b> el personal del Centro guarda secreto sobre la información de los pacientes, incluso después de dejar de laborar.")

    b.h2("Artículo 14. Derechos de los pacientes")
    b.body("Todo paciente o su representante legal podrá ejercer los derechos de acceso, rectificación, cancelación y oposición (ARCO) mediante solicitud escrita presentada al Centro.")

    b.h2("Artículo 15. Medidas de seguridad técnicas")
    b.bullet("Autenticación con usuario y contraseña para todos los usuarios.")
    b.bullet("Roles de acceso que limitan qué puede ver, crear, editar o eliminar cada usuario.")
    b.bullet("Validación de permisos en cada función: el sistema impide el acceso a las secciones no autorizadas para el rol del usuario y muestra el mensaje \"No tienes acceso\".")
    b.bullet("Respaldos periódicos de la base de datos realizados por el Centro.")
    b.bullet("Número de expediente numérico registrado manualmente por el personal, con control de duplicados mediante copias identificadas (ej.: 23455 (1)).")
    b.bullet("El catálogo de especialidades y localidades (incluida la creación de nuevos valores) solo puede ser modificado por el rol Administrador.")
    b.bullet("El sistema no recopila información fuera de la finalidad declarada.")

    b.h2("Artículo 16. Conservación y eliminación")
    b.body("16.1 Los expedientes se conservarán conforme a la normativa de archivos médicos; la eliminación de datos solo podrá realizarla personal autorizado y bajo procedimiento documentado.")

    b.h2("Artículo 17. Modificaciones a este anexo")
    b.body("17.1 Las funcionalidades del sistema pueden evolucionar mediante actualizaciones periódicas, sin modificar las garantías de confidencialidad, seguridad y finalidad establecidas en este anexo.")

    b.spacer(0.5)
    b.body("En constancia de conformidad, ambas partes firman el presente Acuerdo Marco y su Anexo de Protección de Datos Personales de Salud:")
    b.spacer(1.5)
    b.table([
        ["", ""],
        ["Firma y fecha: ____________________", "Firma y fecha: ____________________"],
        ["<b>Alexander James Scheibner</b>", "<b>Amed Enmanuel Canales Mejía</b>"],
        ["Representante legal - Centro Médico San Benito José", "Desarrollador - TurtleLite"],
    ], [8.3 * cm, 8.3 * cm], header=False, center_cols=(0, 1), grid=False, row_heights=[3.0 * cm, None, None, None])

    b.build()


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    out_dir = "docs_v17"
    version = "1.0"
    if "--out" in sys.argv:
        out_dir = sys.argv[sys.argv.index("--out") + 1]
    os.makedirs(out_dir, exist_ok=True)
    manual_direccion(out_dir, version)
    manual_direccion_medica(out_dir, version)
    manual_medico(out_dir, version)
    acuerdo_marco(out_dir, version)
    print("PDFs generados en:", os.path.abspath(out_dir))

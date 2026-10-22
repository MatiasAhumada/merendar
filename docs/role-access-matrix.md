# Matriz de responsabilidades y acceso por rol

> Estado: definición basada en la entrevista compartida y las cinco fotos revisadas. Esas fotos muestran los artículos estatutarios 21 (Presidencia), 22 (Secretaría) y 23 (Tesorería). En el conjunto recibido no aparecen artículos de Vocalía ni Revisión de cuentas; no otorgarles permisos por inferencia. Los permisos existentes describen la app y no sustituyen la aprobación operativa de la asociación.

## Cómo leer la evidencia

- **Estatuto fotografiado:** deber o atribución visible en las imágenes, citado por título/artículo y archivo original.
- **Entrevista compartida:** notas del integrante del grupo sobre la respuesta de la entrevistada. Las expresiones “probablemente”, “sugiere” y “no queda claro” son interpretaciones del entrevistador, no hechos confirmados.
- **Comportamiento actual:** capacidad comprobable en el código/documentación de Merendar; no significa que el estatuto la exija.
- **Propuesta o pendiente:** posibilidad que requiere corroborar actividad, datos y procedimiento antes de habilitarla.

Las cinco fotos y la entrevista son fuentes diferentes. Las cláusulas del estatuto no prueban que cada función se ejecute digitalmente en Merendar. No hay segmentación técnica de datos por persona, familia o período dentro de los módulos habilitados.

## Matriz resumida

| Rol | Funciones documentadas | Acceso actual de Merendar | Posible habilitación a evaluar | Evidencia / límite |
|---|---|---|---|---|
| Presidencia | Representar y presidir la asociación; convocar y presidir Comisión Directiva y Asambleas; votar y desempatar; firmar actas, correspondencia y documentos con Secretaría; autorizar gastos con Tesorería conforme resoluciones de Comisión Directiva; velar por administración y cumplimiento del Estatuto; aplicar sanciones a empleados y resolver casos imprevistos sujetos a referéndum. También participa con Secretaría en el registro de entregas y la rendición mensual. | Inicio, Familias, Registro, Módulos y Usuarios. Administra usuarios en exclusiva por regla de COD-1454. Puede operar módulos de beneficiarios/mercadería/rendición junto con Secretaría. | Mantener los accesos actuales. Si se digitalizan actas, correspondencia, resoluciones o gastos, definir permisos y aprobación conjunta antes de implementar; no inferir capacidades actuales para sanciones, representación legal o pagos. | Estatuto, Título V, Art. 21: fotos “WhatsApp Image 2026-10-20 at 10.08.38 PM(3).jpeg” y “...(2).jpeg”. Entrevista: preguntas sobre roles, pasos administrativos y registro. Regla de usuarios: COD-1454. |
| Secretaría | Asistir a Asambleas/Comisión Directiva y redactar actas para el libro; firmar actas con Presidencia; firmar correspondencia y documentos con Presidencia; convocar sesiones de Comisión Directiva; mantener al día libros de actas y, con Tesorería, el Registro de Asociados. Comparte con Presidencia el registro de entregas y rendición mensual según la entrevista. | Inicio, Familias, Registro y Módulos. Tiene capacidades operativas actuales compartidas con Presidencia; no administra usuarios. | Mantener el acceso operativo actual. Si se incorporan actas, correspondencia o asociados, evaluar escritura en esos módulos y firma/aprobación conjunta. Confirmar qué significa “convocar” dentro del flujo digital. El Registro de Asociados no debe confundirse con el padrón de familias/beneficiarios. | Estatuto, Título VI, Art. 22: “WhatsApp Image 2026-10-20 at 10.08.38 PM(1).jpeg”. Entrevista: pregunta sobre quién registra y pasos administrativos. App: `src/constants/navigation.constant.ts`, `docs/delivery.md`, `docs/merchandise.md`. |
| Tesorería | Asistir a sesiones/Asambleas; llevar con Secretaría el Registro de Asociados y ocuparse del cobro de cuotas sociales; llevar libros contables; presentar balances mensuales y preparar el balance general, cuenta de gastos/recursos e inventario anuales; firmar con Presidencia recibos y documentos de Tesorería para pagos autorizados por Comisión Directiva; depositar fondos en cuenta de la asociación con orden conjunta; retener efectivo solo dentro del límite autorizado; informar el estado económico a Comisión Directiva y al órgano de fiscalización cuando lo soliciten. | Puede iniciar sesión e ir a Inicio, sin métricas ni tareas operativas. Merendar no tiene libros contables, cuotas sociales, pagos, depósitos bancarios ni balances. | Evaluar un módulo financiero con alcance mínimo para Registro de Asociados/cuotas si esa actividad ocurre; balances, gastos y comprobantes; y reportes de rendición al órgano fiscalizador. Separar lectura, registro, firma/autorización y aprobación. Pagos deben seguir requiriendo autorización de Comisión Directiva y firma conjunta que corresponda. | Estatuto, Título VII, Art. 23: “WhatsApp Image 2026-10-20 at 10.08.38 PM.jpeg” y “WhatsApp Image 2026-10-20 at 10.10.10 PM.jpeg”. La entrevista no menciona donaciones monetarias recibidas ni recibos AFIP; no aclara si se cobran cuotas sociales. No asumir que no existen ingresos o que las tareas financieras ya se realizan. |
| Vocalía | El estatuto referido para este rol no está entre las imágenes recibidas. La entrevista confirma que existen vocales, sin describir responsabilidades concretas. | Puede iniciar sesión e ir a Inicio, sin métricas ni accesos operativos. | Mantener accesos operativos cerrados hasta revisar el artículo estatutario aplicable y confirmar tareas. Si una tarea concreta requiere la app, habilitar solo los datos y acciones necesarios. | Sin fuente de atribuciones en las cinco fotos. Entrevista, pregunta sobre roles: menciona vocales sin describir sus tareas. COD-1454 impide inferir permisos por jerarquía. |
| Revisión de cuentas | No hay artículo de este órgano en las fotos recibidas. La entrevista dice que “las controla”, pero no define qué revisa, qué documentos consulta, frecuencia, reporte ni capacidad de aprobación. | Puede iniciar sesión e ir a Inicio, sin métricas ni accesos operativos. La revisión de rendiciones existente está habilitada a Presidencia y Secretaría. No hay módulo de auditoría. | Mantener acceso cerrado hasta precisar mandato y procedimiento. Si se confirma control de rendiciones u otros documentos, evaluar vista de solo lectura, información mínima y un flujo de observaciones. Separar control, resolución de observaciones y aprobación de la Comisión Directiva; no conceder aprobación general. | Sin artículo específico entre las fotos aportadas. Entrevista, respuestas sobre roles y frecuencia de revisión. COD-1454 prohíbe equiparar el cargo con aprobación de todo el sistema. |

## Recorrido actual por rol

- **Presidencia:** Login → Inicio → Familias, Registro, Módulos o Usuarios. Inicio presenta métricas y acciones operativas. Usuarios es exclusivo de Presidencia. Las acciones privadas se validan nuevamente en el servidor.
- **Secretaría:** Login → Inicio → Familias, Registro o Módulos. Inicio presenta métricas y accesos operativos. No ve ni opera Usuarios.
- **Tesorería:** Login → Inicio. Ve su rol y el estado sin métricas ni acciones habilitadas. Los módulos estatutarios de contabilidad/tesorería aún no existen.
- **Vocalía:** Login → Inicio. Ve el estado sin métricas ni acciones habilitadas. No habilitar una vista operativa hasta revisar sus deberes y atribuciones.
- **Revisión de cuentas:** Login → Inicio. Ve el estado sin métricas ni acciones habilitadas. No equiparar el título con la revisión de rendiciones ni con autoridad de aprobación.

Fuentes técnicas del flujo: `src/app/login/page.tsx`, `src/app/(app)/page.tsx`, `src/constants/navigation.constant.ts`, `src/constants/dashboard.constant.ts`, `src/server/services/dashboard-access.ts`.

## Ciclo de mercadería y datos personales

La entrevista indica que Presidencia y Secretaría llevan juntas los registros en papel. Solicitan módulos a Desarrollo Social, notifican manualmente a las personas, completan planillas por fecha con nombre, apellido, dirección y firma, adjuntan fotocopias de DNI y presentan esa rendición al día siguiente de la entrega. Se menciona un cupo de 100 personas por mes y otra planilla para el merendero. Desarrollo Social entrega el remito y la mercadería para el siguiente ciclo.

Merendar permite registrar beneficiarios por período, rechaza duplicados de la misma persona en el período, genera planillas propias versionadas y almacena rendiciones como documentos privados. El PDF de Merendar no es el formulario oficial ministerial: verificar con las fotos/documentos que el organismo acepte el formato antes de sustituir la planilla física. No hay una solicitud explícita de reportes estadísticos ni notificaciones automáticas.

El acceso offline permite guardar ciertas capturas como borradores desde una vista ya abierta y con sesión vigente; no permite iniciar sesión ni recuperar vistas privadas después de recargar. La entrevistada usa teléfono, está abierta a computadora y reporta conectividad Wi-Fi inestable, con uso de datos móviles.

Fuentes técnicas: `docs/delivery.md`, `docs/merchandise.md`, `docs/offline.md`, `src/server/services/record-access.ts`, `src/server/services/merchandise-access.ts`.

## Límites para diseñar permisos

1. La administración de cuentas sigue siendo exclusiva de Presidencia según COD-1454.
2. Presidencia y Secretaría tienen acceso de registro compartido confirmado por entrevista; las facultades estatutarias conjuntas de firma también deben respetarse si esos documentos se digitalizan.
3. Las funciones contables de Tesorería están respaldadas por el estatuto. La entrevista no aclara si se cobran cuotas sociales actualmente; confirmar antes de habilitar operaciones monetarias.
4. El Registro de Asociados y las cuotas sociales son distintos del padrón de familias beneficiarias y de los módulos de mercadería. No reutilizar sus permisos sin definir esa relación.
5. El estatuto condiciona gastos/pagos a decisiones y límites de Comisión Directiva, y describe firmas conjuntas. No implementar capacidades individuales de aprobar o pagar a partir de un permiso genérico de Tesorería o Presidencia.
6. Vocalía y Revisión de cuentas no tienen atribuciones estatutarias identificables en las imágenes recibidas. Mantener el bloqueo hasta obtener sus artículos o una definición explícita.
7. Separar siempre: preparar, registrar, firmar, revisar, observar, aprobar y ejecutar pagos. Una misma vista puede requerir acciones distintas con autorizaciones distintas.

## Referencias visuales revisadas

| Archivo original | Título / artículo visible | Atribuciones usadas |
|---|---|---|
| `WhatsApp Image 2026-10-20 at 10.08.38 PM(3).jpeg` | Título V, Art. 21, Presidente; primera parte | Representación; convocar/presidir; voto y desempate; inicio de firma conjunta. |
| `WhatsApp Image 2026-10-20 at 10.08.38 PM(2).jpeg` | Título V, Art. 21, continuación | Firma con Secretaría; autorización de gastos con Tesorería; dirección de reuniones; velar por administración y estatuto; sanciones y decisiones imprevistas sujetas a referéndum. |
| `WhatsApp Image 2026-10-20 at 10.08.38 PM(1).jpeg` | Título VI, Art. 22, Secretario | Actas; firma conjunta; convocatorias; libros de actas y Registro de Asociados. |
| `WhatsApp Image 2026-10-20 at 10.08.38 PM.jpeg` | Título VII, Art. 23, Tesorero; primera parte | Sesiones; Registro de Asociados y cuotas sociales; libros contables. |
| `WhatsApp Image 2026-10-20 at 10.10.10 PM.jpeg` | Título VII, Art. 23, continuación | Balances; pagos autorizados y firmas; depósitos/límites de caja; informes económicos. |

El borde de las fotos recorta parte del texto y hay sellos/firma sobre algunas líneas. Las funciones citadas se leen; no se atribuyó una página porque el número no es legible con certeza. La cláusula de Vocalía y la del órgano de Revisión de cuentas no aparecen en este conjunto.

## Estado

La matriz relaciona todas las fotos recibidas con los artículos legibles y cita las responsabilidades atribuidas. Presidencia, Secretaría y Tesorería tienen deberes estatutarios descritos; Vocalía y Revisión de cuentas quedan expresamente sin acceso operativo hasta documentar sus funciones. No se modifican permisos ni pantallas en este ticket. Antes de declarar la matriz aprobada, confirmar con la organización el alcance digital, la cobranza de cuotas sociales y la aceptación del PDF de Merendar como formato de rendición. La captura manual de firma y documentos sigue el flujo papel/PDF confirmado por COD-1454.

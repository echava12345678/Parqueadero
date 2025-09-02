/**
 * @fileoverview Lógica principal para la aplicación de gestión de parqueadero.
 * Este script maneja la autenticación, la gestión de vehículos activos y salientes,
 * la actualización de tarifas de forma dinámica y la generación de recibos en PDF.
 * Se conecta a Firestore para la persistencia de datos y garantiza una experiencia de usuario
 * fluida y en tiempo real.
 *
 * NOTA: Para el correcto funcionamiento en el entorno de Canvas, se utilizan variables
 * globales para la configuración de Firebase y el token de autenticación.
 * * Versión: 2.0
 */

// Importaciones de Firebase, Auth y Firestore
// Se asume que estas importaciones están disponibles a través de la etiqueta <script type="module">
// en el archivo HTML principal y se exponen globalmente.

const { jsPDF } = window.jspdf;

// =====================================================================================================================
// Definición de variables globales y elementos del DOM
// =====================================================================================================================

// Variables globales para la configuración de Firebase
const db = window.db;
const auth = window.auth;
const appId = window.appId;
const initialAuthToken = window.initialAuthToken;

// Elementos del DOM
const loginSection = document.getElementById('login-section');
const mainApp = document.getElementById('main-app');
const loginForm = document.getElementById('login-form');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const adminTabButton = document.getElementById('admin-tab-button');
const entryForm = document.getElementById('entry-form');
const exitForm = document.getElementById('exit-form');
const resultDiv = document.getElementById('result');
const resultContent = document.getElementById('result-content');
const activeVehiclesList = document.getElementById('active-vehicles');
const printReceiptBtn = document.getElementById('print-receipt');
const savePricesBtn = document.getElementById('save-prices');
const notificationArea = document.getElementById('notification-area');
const loginMessage = document.getElementById('login-message');
const specialClientCheckbox = document.getElementById('special-client');
const specialClientSection = document.getElementById('special-client-section');
const vehicleSearchInput = document.getElementById('vehicle-search');
const tabs = document.querySelectorAll('.tab-button');
const entryTypeSelect = document.getElementById('type-entry');
const othersTypeContainer = document.getElementById('others-type-container');

// Variables de estado de la aplicación
let currentUser = null;
let currentPrices = {};
let activeVehicles = [];
let filteredVehicles = [];

// =====================================================================================================================
// Funciones de utilidad
// =====================================================================================================================

/**
 * Formatea un número a formato de moneda colombiana.
 * @param {number} num El número a formatear.
 * @returns {string} El número formateado como string.
 */
const formatNumber = (num) => new Intl.NumberFormat('es-CO').format(num);

/**
 * Muestra una notificación temporal al usuario.
 * @param {string} message El mensaje a mostrar.
 * @param {string} type El tipo de notificación (success, error, warning).
 */
const showNotification = (message, type = 'info') => {
    notificationArea.textContent = message;
    notificationArea.className = `message ${type}-message`;
    notificationArea.style.display = 'block';
    setTimeout(() => {
        notificationArea.style.display = 'none';
    }, 5000);
};

/**
 * Muestra u oculta un elemento del DOM.
 * @param {HTMLElement} element El elemento a manipular.
 * @param {boolean} show Si es `true`, muestra el elemento; si es `false`, lo oculta.
 */
const toggleElementVisibility = (element, show) => {
    element.style.display = show ? 'block' : 'none';
};

// =====================================================================================================================
// Lógica de Autenticación y UI
// =====================================================================================================================

/**
 * Maneja el inicio de sesión del usuario.
 * Simula la autenticación y ajusta la UI en consecuencia.
 * @param {Event} e El evento de envío del formulario.
 */
const handleLogin = async (e) => {
    e.preventDefault();
    const username = loginForm.username.value;
    const password = loginForm.password.value;

    if (username === 'admin' && password === 'admin') {
        currentUser = { uid: 'admin-id', role: 'admin' };
        showMainApp();
    } else {
        showNotification('Credenciales incorrectas.', 'error');
        loginMessage.textContent = 'Credenciales incorrectas.';
        loginMessage.style.display = 'block';
    }
};

/**
 * Muestra la interfaz principal de la aplicación y oculta la de inicio de sesión.
 */
const showMainApp = async () => {
    toggleElementVisibility(loginSection, false);
    toggleElementVisibility(mainApp, true);
    toggleElementVisibility(btnLogin, false);
    toggleElementVisibility(btnLogout, true);
    loginMessage.style.display = 'none';

    // Mostrar el panel de admin si el usuario es admin
    if (currentUser && currentUser.role === 'admin') {
        toggleElementVisibility(adminTabButton, true);
        specialClientSection.style.display = 'block';
        await loadAdminPrices();
    } else {
        toggleElementVisibility(adminTabButton, false);
        specialClientSection.style.display = 'none';
        await loadAdminPrices();
    }

    // Inicializa los listeners para las pestañas
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelector('.tab-button.active').classList.remove('active');
            tab.classList.add('active');
            document.querySelector('.tab-content.active-tab').classList.remove('active-tab');
            document.querySelector('.tab-content.active-tab').style.display = 'none';
            const targetTab = document.getElementById(tab.dataset.tab);
            targetTab.classList.add('active-tab');
            targetTab.style.display = 'block';
        });
    });
};

/**
 * Maneja el cierre de sesión del usuario.
 */
const handleLogout = () => {
    currentUser = null;
    toggleElementVisibility(mainApp, false);
    toggleElementVisibility(loginSection, true);
    toggleElementVisibility(btnLogin, true);
    toggleElementVisibility(btnLogout, false);
    loginForm.reset();
};

// =====================================================================================================================
// Lógica de Firestore
// =====================================================================================================================

/**
 * Obtiene la referencia a la colección de precios del admin.
 * @returns {FirestoreCollection} La referencia a la colección de precios.
 */
const getPricesCollection = () => {
    // La colección de precios del admin es pública para que la app pueda leerla sin autenticación avanzada
    return collection(db, `artifacts/${appId}/public/data/admin_prices`);
};

/**
 * Obtiene la referencia a la colección de vehículos activos.
 * @returns {FirestoreCollection} La referencia a la colección de vehículos activos.
 */
const getActiveVehiclesCollection = () => {
    return collection(db, `artifacts/${appId}/public/data/active_vehicles`);
};

/**
 * Carga las tarifas del administrador desde Firestore.
 * Si no hay tarifas, guarda las predeterminadas.
 */
const loadAdminPrices = async () => {
    try {
        const pricesColRef = getPricesCollection();
        const pricesQuery = query(pricesColRef, where('documentId', '==', 'default-prices'));
        const querySnapshot = await getDocs(pricesQuery);

        if (querySnapshot.empty) {
            console.log("No hay tarifas de administrador. Guardando tarifas predeterminadas.");
            const defaultPrices = {
                'car-half-hour': 3000,
                'car-hour': 6000,
                'bike-half-hour': 2000,
                'bike-hour': 4000,
                'car-12h': 30000,
                'bike-12h': 15000,
                'car-month': 250000,
                'bike-month': 150000,
                'other-small-min': 100000,
                'other-small-max': 150000,
                'other-small-default': 120000,
                'other-medium-min': 151000,
                'other-medium-max': 200000,
                'other-medium-default': 180000,
                'other-large-min': 201000,
                'other-large-max': 300000,
                'other-large-default': 250000,
                'other-night-small-min': 10000,
                'other-night-small-max': 15000,
                'other-night-small-default': 12000,
                'other-night-medium-min': 15100,
                'other-night-medium-max': 20000,
                'other-night-medium-default': 18000,
                'other-night-large-min': 20100,
                'other-night-large-max': 30000,
                'other-night-large-default': 25000,
                'documentId': 'default-prices'
            };
            await addDoc(pricesColRef, defaultPrices);
            currentPrices = defaultPrices;
        } else {
            const pricesDoc = querySnapshot.docs[0];
            currentPrices = pricesDoc.data();
        }
        updateAdminPanelInputs();
        updateEntryFormOptions();
    } catch (e) {
        console.error("Error al cargar o guardar precios: ", e);
        showNotification("Error al cargar las tarifas. Por favor, intente de nuevo más tarde.", "error");
    }
};

/**
 * Actualiza los valores de los inputs del panel de administración con los precios cargados.
 */
const updateAdminPanelInputs = () => {
    for (const key in currentPrices) {
        const input = document.getElementById(key);
        if (input) {
            input.value = currentPrices[key];
        }
    }
};

/**
 * Actualiza las opciones del formulario de entrada con los precios de 12 horas.
 */
const updateEntryFormOptions = () => {
    // Limpiamos las opciones dinámicas si existen
    const dynamicOptions = entryTypeSelect.querySelectorAll('.dynamic-option');
    dynamicOptions.forEach(opt => opt.remove());

    // Obtenemos los precios de 12 horas del objeto de precios
    const car12hPrice = currentPrices['car-12h'];
    const bike12hPrice = currentPrices['bike-12h'];

    // Agregamos las nuevas opciones con el valor concatenado
    if (car12hPrice) {
        const option = document.createElement('option');
        option.value = 'carro-12h';
        option.className = 'dynamic-option';
        option.textContent = `Carro (por 12 horas) - $${formatNumber(car12hPrice)} COP`;
        entryTypeSelect.add(option, entryTypeSelect.options[2]); // Inserta antes de mensualidad
    }
    if (bike12hPrice) {
        const option = document.createElement('option');
        option.value = 'moto-12h';
        option.className = 'dynamic-option';
        option.textContent = `Moto (por 12 horas) - $${formatNumber(bike12hPrice)} COP`;
        entryTypeSelect.add(option, entryTypeSelect.options[4]); // Inserta antes de moto-mensualidad
    }
};

/**
 * Guarda las tarifas del administrador en Firestore.
 * @param {Event} e El evento del clic.
 */
const handleSavePrices = async (e) => {
    e.preventDefault();
    try {
        const pricesColRef = getPricesCollection();
        const pricesQuery = query(pricesColRef, where('documentId', '==', 'default-prices'));
        const querySnapshot = await getDocs(pricesQuery);

        if (querySnapshot.empty) {
            showNotification('No se encontró el documento de precios para actualizar.', 'error');
            return;
        }
        
        const pricesDocRef = querySnapshot.docs[0].ref;
        const updatedPrices = {};
        const inputs = document.querySelectorAll('#admin-panel input');
        inputs.forEach(input => {
            updatedPrices[input.id] = parseInt(input.value, 10);
        });

        currentPrices = { ...currentPrices, ...updatedPrices };
        await setDoc(pricesDocRef, currentPrices);
        
        updateEntryFormOptions();
        showNotification('Tarifas actualizadas correctamente.', 'success');
    } catch (e) {
        console.error("Error al guardar precios: ", e);
        showNotification("Error al guardar las tarifas.", "error");
    }
};

/**
 * Escucha en tiempo real los cambios en la colección de vehículos activos.
 */
const setupRealtimeListener = () => {
    const activeVehiclesColRef = getActiveVehiclesCollection();
    onSnapshot(activeVehiclesColRef, (querySnapshot) => {
        activeVehicles = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        displayActiveVehicles(activeVehicles);
    }, (error) => {
        console.error("Error al escuchar cambios en la colección de vehículos: ", error);
        showNotification("Error de conexión con la base de datos.", "error");
    });
};

// =====================================================================================================================
// Lógica de Vehículos Activos
// =====================================================================================================================

/**
 * Muestra la lista de vehículos activos en el DOM.
 * @param {Array<Object>} vehicles La lista de vehículos a mostrar.
 */
const displayActiveVehicles = (vehicles) => {
    activeVehiclesList.innerHTML = '';
    if (vehicles.length === 0) {
        activeVehiclesList.innerHTML = '<li class="empty-list">No hay vehículos registrados.</li>';
        return;
    }
    vehicles.forEach(vehicle => {
        const li = document.createElement('li');
        li.className = 'vehicle-item fade-in';
        const formattedEntryTime = new Date(vehicle.entryTime).toLocaleString('es-CO');
        li.innerHTML = `
            <div class="vehicle-info">
                <strong>Placa:</strong> ${vehicle.plate}
                <span class="vehicle-type">${vehicle.type}</span>
                <p><strong>Entrada:</strong> ${formattedEntryTime}</p>
                <p><strong>Usuario ID:</strong> ${vehicle.userId}</p>
            </div>
            <button class="remove-vehicle-btn" data-id="${vehicle.id}"><i class="fas fa-trash-alt"></i></button>
        `;
        activeVehiclesList.appendChild(li);
    });

    // Agregar listener para el botón de eliminar
    document.querySelectorAll('.remove-vehicle-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const vehicleId = e.currentTarget.dataset.id;
            const confirmed = window.confirm("¿Está seguro que desea eliminar este vehículo? Esto no generará un recibo.");
            if (confirmed) {
                await deleteVehicle(vehicleId);
            }
        });
    });
};

/**
 * Filtra los vehículos activos según el tipo.
 * @param {string} filterType El tipo de vehículo para filtrar.
 */
const filterVehicles = (filterType) => {
    let filteredList = activeVehicles;
    if (filterType !== 'all') {
        filteredList = activeVehicles.filter(v => v.type === filterType);
    }
    displayActiveVehicles(filteredList);
};

/**
 * Busca vehículos por placa o descripción.
 * @param {string} searchTerm El término de búsqueda.
 */
const searchVehicles = (searchTerm) => {
    const normalizedTerm = searchTerm.toLowerCase();
    const searchResults = activeVehicles.filter(v => 
        v.plate.toLowerCase().includes(normalizedTerm) ||
        v.type.toLowerCase().includes(normalizedTerm)
    );
    displayActiveVehicles(searchResults);
};

// =====================================================================================================================
// Lógica de Registro de Entrada
// =====================================================================================================================

/**
 * Maneja el registro de entrada de un vehículo.
 * @param {Event} e El evento de envío del formulario.
 */
const handleEntry = async (e) => {
    e.preventDefault();
    const plate = entryForm['plate-entry'].value.trim().toUpperCase();
    const type = entryForm['type-entry'].value;
    const entryTime = new Date().getTime();
    
    // Validar si la placa ya existe
    const vehicleQuery = query(getActiveVehiclesCollection(), where("plate", "==", plate));
    const querySnapshot = await getDocs(vehicleQuery);
    if (!querySnapshot.empty) {
        showNotification(`El vehículo con placa ${plate} ya está registrado.`, 'error');
        return;
    }

    const newVehicle = {
        plate,
        type,
        entryTime,
        userId: currentUser ? currentUser.uid : 'sin-usuario'
    };

    if (type === 'otros-mensualidad' || type === 'otros-noche') {
        newVehicle.size = othersTypeContainer.querySelector('#others-vehicle-size').value;
        newVehicle.agreedPrice = parseFloat(othersTypeContainer.querySelector('#others-monthly-price').value);
    }
    
    try {
        await addDoc(getActiveVehiclesCollection(), newVehicle);
        showNotification(`Entrada registrada para el vehículo ${plate}.`, 'success');
        entryForm.reset();
    } catch (error) {
        console.error("Error al registrar entrada: ", error);
        showNotification("Error al registrar entrada. Por favor, intente de nuevo.", 'error');
    }
};

// =====================================================================================================================
// Lógica de Cálculo de Costos y Salida
// =====================================================================================================================

/**
 * Calcula el costo de la estadía de un vehículo.
 * Implementa la lógica de cobro por media hora.
 * @param {Object} vehicle El objeto del vehículo.
 * @param {number} exitTime El tiempo de salida en milisegundos.
 * @returns {Object} Un objeto con el costo final, original y el tiempo de estadía.
 */
const calculateCost = (vehicle, exitTime) => {
    const durationMs = exitTime - vehicle.entryTime;
    const durationMinutes = Math.ceil(durationMs / (1000 * 60));
    const durationHours = durationMinutes / 60;
    
    let baseCost = 0;
    let timeUnit = '';
    let isFlatRate = false;

    // Lógica para cobro por media hora (múltiplos de la tarifa de media hora)
    const calculateHourlyCost = (halfHourPrice) => {
        // Se cobra por cada bloque de 30 minutos o fracción.
        // Math.ceil(durationMinutes / 30) nos da el número de bloques de 30 minutos a cobrar.
        const halfHourBlocks = Math.ceil(durationMinutes / 30);
        return halfHourPrice * halfHourBlocks;
    };

    switch (vehicle.type) {
        case 'carro':
            baseCost = calculateHourlyCost(currentPrices['car-half-hour']);
            timeUnit = ' (Por Hora)';
            break;
        case 'moto':
            baseCost = calculateHourlyCost(currentPrices['bike-half-hour']);
            timeUnit = ' (Por Hora)';
            break;
        case 'carro-12h':
            baseCost = currentPrices['car-12h'];
            timeUnit = ' (Tarifa Plana 12h)';
            isFlatRate = true;
            break;
        case 'moto-12h':
            baseCost = currentPrices['bike-12h'];
            timeUnit = ' (Tarifa Plana 12h)';
            isFlatRate = true;
            break;
        case 'mensualidad':
            baseCost = currentPrices['car-month'];
            timeUnit = ' (Mensualidad)';
            isFlatRate = true;
            break;
        case 'moto-mensualidad':
            baseCost = currentPrices['bike-month'];
            timeUnit = ' (Mensualidad)';
            isFlatRate = true;
            break;
        case 'otros-mensualidad':
            baseCost = vehicle.agreedPrice;
            timeUnit = ` (Mensualidad - ${vehicle.size})`;
            isFlatRate = true;
            break;
        case 'otros-noche':
            baseCost = vehicle.agreedPrice;
            timeUnit = ` (Por Noche - ${vehicle.size})`;
            isFlatRate = true;
            break;
        default:
            baseCost = 0;
            timeUnit = '';
            break;
    }

    const hours = Math.floor(durationHours);
    const minutes = Math.floor(durationMinutes % 60);

    const timeString = `${hours}h ${minutes}m`;
    
    return {
        costoOriginal: baseCost,
        tiempoEstadia: timeString,
        isFlatRate: isFlatRate
    };
};

/**
 * Maneja el registro de salida y cálculo de costos.
 * @param {Event} e El evento de envío del formulario.
 */
const handleExit = async (e) => {
    e.preventDefault();
    const plate = exitForm['plate-exit'].value.trim().toUpperCase();
    const specialClientAdjustment = parseFloat(exitForm['special-client-adjustment'].value) || 0;

    try {
        const vehiclesColRef = getActiveVehiclesCollection();
        const vehicleQuery = query(vehiclesColRef, where("plate", "==", plate));
        const querySnapshot = await getDocs(vehicleQuery);

        if (querySnapshot.empty) {
            showNotification(`No se encontró un vehículo con placa ${plate}.`, 'error');
            return;
        }

        const vehicleDoc = querySnapshot.docs[0];
        const vehicleData = vehicleDoc.data();
        const exitTime = new Date().getTime();
        
        const costData = calculateCost(vehicleData, exitTime);
        let finalCost = costData.costoOriginal;

        if (specialClientCheckbox.checked) {
            finalCost += specialClientAdjustment;
        }

        // Display results
        const receiptData = {
            plate: vehicleData.plate,
            type: vehicleData.type,
            entryTime: new Date(vehicleData.entryTime).toLocaleString('es-CO'),
            exitTime: new Date(exitTime).toLocaleString('es-CO'),
            tiempoEstadia: costData.tiempoEstadia,
            costoOriginal: costData.costoOriginal,
            ajusteEspecial: specialClientCheckbox.checked ? specialClientAdjustment : 0,
            costoFinal: Math.max(0, finalCost),
            isFlatRate: costData.isFlatRate
        };

        displayResult(receiptData);

        // Almacenar los datos del recibo para el botón de impresión
        printReceiptBtn.onclick = () => generatePDF(receiptData);
        
        // Eliminar el vehículo de la base de datos solo si el cálculo fue exitoso
        await deleteDoc(doc(vehiclesColRef, vehicleDoc.id));
        showNotification(`Salida procesada para el vehículo ${plate}.`, 'success');

    } catch (error) {
        console.error("Error al procesar la salida: ", error);
        showNotification("Error al procesar la salida. Por favor, intente de nuevo.", 'error');
    }
};

/**
 * Elimina un vehículo de la base de datos sin generar recibo.
 * @param {string} vehicleId El ID del documento del vehículo a eliminar.
 */
const deleteVehicle = async (vehicleId) => {
    try {
        const vehiclesColRef = getActiveVehiclesCollection();
        await deleteDoc(doc(vehiclesColRef, vehicleId));
        showNotification("Vehículo eliminado correctamente.", "success");
    } catch (error) {
        console.error("Error al eliminar el vehículo: ", error);
        showNotification("Error al eliminar el vehículo.", "error");
    }
};

/**
 * Muestra los detalles de la salida en el DOM.
 * @param {Object} receiptData Los datos del recibo a mostrar.
 */
const displayResult = (receiptData) => {
    resultDiv.style.display = 'block';
    const content = `
        <p><strong>Placa:</strong> ${receiptData.plate}</p>
        <p><strong>Tipo:</strong> ${receiptData.type}</p>
        <p><strong>Entrada:</strong> ${receiptData.entryTime}</p>
        <p><strong>Salida:</strong> ${receiptData.exitTime}</p>
        <p><strong>Tiempo de Estadía:</strong> ${receiptData.tiempoEstadia}</p>
        ${!receiptData.isFlatRate ? `<p><strong>Costo Original:</strong> $${formatNumber(receiptData.costoOriginal)} COP</p>` : ''}
        ${receiptData.ajusteEspecial !== 0 ? `<p><strong>Ajuste Especial:</strong> ${receiptData.ajusteEspecial >= 0 ? '+' : ''}$${formatNumber(receiptData.ajusteEspecial)} COP</p>` : ''}
        <h3>TOTAL A PAGAR: $${formatNumber(receiptData.costoFinal)} COP</h3>
    `;
    resultContent.innerHTML = content;
};

// =====================================================================================================================
// Lógica de Generación de PDF
// =====================================================================================================================

/**
 * Genera un recibo en formato PDF.
 * @param {Object} receiptData Los datos para el recibo.
 */
const generatePDF = (receiptData) => {
    const doc = new jsPDF();
    let y = 20;

    // Título y logo
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(41, 128, 185);
    doc.text('Recibo de Parqueadero', 105, y, null, null, 'center');
    y += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Parqueadero Villa_laundrycoffee', 105, y, null, null, 'center');
    y += 5;
    doc.text(`Fecha de Impresión: ${new Date().toLocaleDateString('es-CO')}`, 105, y, null, null, 'center');
    y += 15;

    // Información del vehículo
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 51, 51);
    doc.text('Información del Vehículo', 20, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.text(`Placa: ${receiptData.plate}`, 20, y);
    y += 7;
    doc.text(`Tipo: ${receiptData.type}`, 20, y);
    y += 10;

    // Detalles de la estadía
    doc.setFont('helvetica', 'bold');
    doc.text('Detalles de la Estadía', 20, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.text(`Entrada: ${receiptData.entryTime}`, 20, y);
    y += 7;
    doc.text(`Salida: ${receiptData.exitTime}`, 20, y);
    y += 7;

    // Resumen de costos
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen de Costos', 20, y);
    y += 7;

    if (receiptData.isFlatRate) {
        doc.setFont('helvetica', 'normal');
        doc.text(`Tarifa Plana: $${formatNumber(receiptData.costoOriginal)} COP`, 20, y);
        y += 7;
        doc.text(`Tiempo de Estadía: ${receiptData.tiempoEstadia}`, 20, y);
        y += 7;
        if (receiptData.ajusteEspecial !== 0) {
            doc.text(`Ajuste Especial: ${receiptData.ajusteEspecial >= 0 ? '+' : ''}$${formatNumber(receiptData.ajusteEspecial)} COP`, 20, y);
            y += 7;
        }
        y += 5;
    } else {
        doc.setFont('helvetica', 'normal');
        doc.text(`Tiempo de Estadía: ${receiptData.tiempoEstadia}`, 20, y);
        y += 7;
        doc.text(`Costo Original: $${formatNumber(receiptData.costoOriginal)} COP`, 20, y);
        y += 7;
        if (receiptData.ajusteEspecial !== 0) {
            doc.text(`Ajuste Especial: ${receiptData.ajusteEspecial >= 0 ? '+' : ''}$${formatNumber(receiptData.ajusteEspecial)} COP`, 20, y);
            y += 7;
        }
    }

    // Costo total
    y += 5;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(52, 152, 219);
    doc.text(`TOTAL A PAGAR: $${formatNumber(receiptData.costoFinal)} COP`, 20, y);
    y += 20;

    // Pie de página
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('¡Gracias por su visita!', 105, y, null, null, 'center');
    y += 5;
    doc.text('Medellín, Antioquia, Colombia', 105, y, null, null, 'center');

    doc.save(`Recibo-${receiptData.plate}.pdf`);
};

// =====================================================================================================================
// Eventos y Inicialización
// =====================================================================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Autenticación inicial del usuario
    try {
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
            console.log("Autenticación con token inicial exitosa.");
        } else {
            await signInAnonymously(auth);
            console.log("Autenticación anónima exitosa.");
        }
    } catch (error) {
        console.error("Error en la autenticación: ", error);
        showNotification("Error de autenticación. Algunas funciones pueden no estar disponibles.", "error");
    }

    // Listener para los formularios
    loginForm.addEventListener('submit', handleLogin);
    entryForm.addEventListener('submit', handleEntry);
    exitForm.addEventListener('submit', handleExit);
    
    // Listener para los botones de la barra de navegación
    btnLogin.addEventListener('click', () => toggleElementVisibility(loginSection, true));
    btnLogout.addEventListener('click', handleLogout);

    // Listener para el cambio de tipo de vehículo en el formulario de entrada
    entryTypeSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === 'otros-mensualidad' || value === 'otros-noche') {
            toggleElementVisibility(othersTypeContainer, true);
        } else {
            toggleElementVisibility(othersTypeContainer, false);
        }
    });

    // Listener para el panel de administración
    if (currentUser && currentUser.role === 'admin') {
        savePricesBtn.addEventListener('click', handleSavePrices);
    }
    
    // Listener para el filtro de vehículos
    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelector('.filter-button.active').classList.remove('active');
            e.target.classList.add('active');
            filterVehicles(e.target.dataset.filter);
        });
    });

    // Listener para la búsqueda de vehículos
    vehicleSearchInput.addEventListener('input', (e) => {
        searchVehicles(e.target.value);
    });

    // Listener para el checkbox de cliente especial
    specialClientCheckbox.addEventListener('change', () => {
        const adjustmentInput = document.getElementById('special-client-adjustment');
        if (specialClientCheckbox.checked) {
            adjustmentInput.removeAttribute('disabled');
        } else {
            adjustmentInput.setAttribute('disabled', 'true');
            adjustmentInput.value = 0;
        }
    });

    // Carga inicial de precios y configuración de listener en tiempo real
    await loadAdminPrices();
    setupRealtimeListener();
});

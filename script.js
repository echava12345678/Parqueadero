// Archivo de script principal para la aplicación de gestión de parqueaderos.
// Este script maneja la lógica de la interfaz de usuario, la interacción con Firebase
// para el almacenamiento de datos, y la generación de recibos en formato PDF.

// Importación de las librerías necesarias desde Firebase y jsPDF.
// jsPDF se importa desde la ventana global ya que se carga en el HTML.
const { jsPDF } = window.jspdf;
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";

//----------------------------------------------------------------------------------------------------
// NUEVA FUNCIONALIDAD: CONFIGURACIÓN Y AUTENTICACIÓN DE FIREBASE
//----------------------------------------------------------------------------------------------------

// Variables globales para la configuración y el estado de Firebase.
// `__app_id` y `__firebase_config` son variables proporcionadas por el entorno de ejecución.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
let app, db, auth;
let userId;
let currentPrices = []; // Almacena las tarifas actuales para un acceso rápido.

document.addEventListener('DOMContentLoaded', async () => {
    // Definición de funciones de utilidad al inicio del script para su uso global.
    // `formatNumber` formatea un número como moneda colombiana.
    const formatNumber = (num) => new Intl.NumberFormat('es-CO').format(num);
    // `parseNumber` elimina puntos y convierte la cadena a un número entero.
    const parseNumber = (str) => parseInt(str.replace(/\./g, '')) || 0;

    // NUEVA FUNCIONALIDAD: Inicialización de la aplicación de Firebase.
    // Se inicializan los servicios de Firestore y Auth.
    if (Object.keys(firebaseConfig).length > 0) {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        console.log("Firebase inicializado con éxito.");
        
        // Manejar el estado de autenticación.
        // Si hay un usuario, se muestra la aplicación principal. Si no, se intenta el login anónimo.
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                loginSection.style.display = 'none';
                mainApp.style.display = 'flex';
                updateLoginMessage(user.email || 'Admin');
                await fetchAndListenToPrices(); // Cargar precios al iniciar la sesión.
                fetchActiveVehicles(); // Cargar vehículos activos.
                console.log("Usuario autenticado:", userId);
            } else {
                try {
                    console.log("No hay usuario autenticado. Intentando autenticación anónima...");
                    if (typeof __initial_auth_token !== 'undefined') {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                    console.log("Autenticación anónima exitosa. Usuario:", auth.currentUser.uid);
                } catch (error) {
                    console.error("Error al autenticarse de forma anónima:", error);
                    loginSection.style.display = 'flex';
                    mainApp.style.display = 'none';
                }
            }
        });
    } else {
        console.error("Configuración de Firebase no encontrada.");
        // Ocultar la aplicación si Firebase no está configurado.
        loginSection.style.display = 'flex';
        mainApp.style.display = 'none';
    }

    // Definición de elementos del DOM.
    // Se obtienen todas las referencias a los elementos HTML por su ID.
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
    const specialClientCheckbox = document.getElementById('special-client-checkbox');
    const specialClientDetails = document.getElementById('special-client-details');
    const adjustmentsInput = document.getElementById('adjustments');
    const totalInput = document.getElementById('final-cost');
    const adminPricesSection = document.getElementById('admin-prices');
    const pricesList = document.getElementById('prices-list');
    const newPriceBtn = document.getElementById('new-price-btn');
    const editPricesSection = document.getElementById('edit-prices-section');
    const vehicleTypeSelect = document.getElementById('vehicle-type-select');
    const hourlyRateInput = document.getElementById('hourly-rate-input');
    const dailyRateInput = document.getElementById('daily-rate-input');
    const hourlyMinutesInput = document.getElementById('hourly-minutes-input');
    const newRateBtn = document.getElementById('new-rate-btn');
    const backToAdminBtn = document.getElementById('back-to-admin');

    let receiptData = null; // Variable para almacenar los datos del recibo temporalmente.

    //----------------------------------------------------------------------------------------------------
    // FUNCIONES DE UTILIDAD PARA LA APLICACIÓN
    //----------------------------------------------------------------------------------------------------

    /**
     * Muestra una notificación temporal en la interfaz de usuario.
     * @param {string} message - El mensaje a mostrar.
     * @param {string} type - El tipo de notificación ('info', 'success', 'error').
     */
    const showNotification = (message, type = 'info') => {
        notificationArea.textContent = message;
        notificationArea.className = `notification ${type}`;
        notificationArea.style.display = 'block';
        setTimeout(() => {
            notificationArea.style.display = 'none';
        }, 5000);
    };

    /**
     * Actualiza el mensaje de bienvenida en la interfaz de usuario.
     * @param {string} message - El mensaje de bienvenida.
     */
    const updateLoginMessage = (message) => {
        loginMessage.textContent = `Bienvenido, ${message}`;
    };

    // NUEVA FUNCIONALIDAD: Cargar y escuchar los precios en tiempo real desde Firestore.
    // Esto asegura que la aplicación siempre tenga las tarifas más recientes.
    const fetchAndListenToPrices = async () => {
        if (!db) return;
        try {
            const pricesCol = collection(db, `artifacts/${appId}/public/data/precios`);
            onSnapshot(pricesCol, (snapshot) => {
                currentPrices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderPrices(currentPrices);
                setupEntryFormOptions(currentPrices); // Actualiza las opciones del formulario.
                console.log("Precios actualizados en tiempo real.");
            });
        } catch (e) {
            console.error("Error fetching or listening to prices: ", e);
            showNotification('Error al cargar precios.', 'error');
        }
    };

    // NUEVA FUNCIONALIDAD: Renderiza la lista de tarifas en la sección de administración.
    const renderPrices = (prices) => {
        pricesList.innerHTML = '';
        if (prices.length === 0) {
            pricesList.innerHTML = '<p class="text-center text-gray-500">No hay tarifas definidas.</p>';
            return;
        }
        prices.forEach(price => {
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between p-2 mb-2 bg-gray-100 rounded-lg shadow-sm';
            // Muestra la tarifa por minuto, y si es una tarifa fija de 12 horas, también la muestra.
            li.innerHTML = `
                <div class="flex-1">
                    <span class="font-semibold text-gray-700">${price.tipoVehiculo}</span>
                    <br>
                    ${price.tarifaMinuto ? `<span class="text-sm text-gray-500">Tarifa por minuto: $${formatNumber(price.tarifaMinuto)} COP</span>` : ''}
                    ${price.tarifaFija ? `<span class="text-sm text-gray-500">Tarifa fija por ${price.tiempoFijo}: $${formatNumber(price.tarifaFija)} COP</span>` : ''}
                </div>
                <button data-id="${price.id}" class="edit-price-btn bg-blue-500 text-white p-2 rounded-full hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                </button>
            `;
            pricesList.appendChild(li);
        });
    };

    // NUEVA FUNCIONALIDAD: Actualiza dinámicamente las opciones del formulario de entrada.
    // Esto asegura que los nuevos tipos de vehículo se muestren correctamente.
    const setupEntryFormOptions = (prices) => {
        const entryVehicleSelect = document.getElementById('tipo-vehiculo-entrada');
        entryVehicleSelect.innerHTML = ''; // Limpia las opciones existentes.

        // Añade las opciones por defecto que siempre deben estar.
        const defaultOptions = ['Carro', 'Moto'];
        defaultOptions.forEach(type => {
            if (!prices.some(p => p.tipoVehiculo === type)) {
                // Solo agrega si no existe una tarifa definida para evitar duplicados.
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                entryVehicleSelect.appendChild(option);
            }
        });

        // Añade las tarifas dinámicas (por minuto y tarifas fijas).
        prices.forEach(price => {
            const option = document.createElement('option');
            option.value = price.tipoVehiculo;
            if (price.tarifaMinuto) {
                // Opción para tarifas por minuto.
                option.textContent = price.tipoVehiculo;
            } else if (price.tarifaFija) {
                // Opción para tarifas fijas de 12 horas, mostrando el precio.
                option.textContent = `${price.tipoVehiculo} (Tarifa Fija: $${formatNumber(price.tarifaFija)} COP)`;
            }
            entryVehicleSelect.appendChild(option);
        });
    };

    /**
     * Muestra la lista de vehículos activos en la interfaz.
     * @param {Array<Object>} vehicles - Un array de objetos de vehículo.
     */
    const renderActiveVehicles = (vehicles) => {
        activeVehiclesList.innerHTML = '';
        if (vehicles.length === 0) {
            activeVehiclesList.innerHTML = '<p class="text-center text-gray-500">No hay vehículos activos.</p>';
            return;
        }
        vehicles.forEach(vehicle => {
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between p-2 mb-2 bg-gray-100 rounded-lg shadow-sm';
            li.innerHTML = `
                <div class="flex-1">
                    <span class="font-semibold text-gray-700">${vehicle.placa}</span> - 
                    <span class="text-sm text-gray-500">${vehicle.tipoVehiculo}</span>
                    <br>
                    <span class="text-xs text-gray-400">Hora de entrada: ${new Date(vehicle.horaEntrada).toLocaleString()}</span>
                </div>
                <button data-placa="${vehicle.placa}" class="exit-btn bg-red-500 text-white p-2 rounded-full hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors duration-200">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                    </svg>
                </button>
            `;
            activeVehiclesList.appendChild(li);
        });
    };
    
    /**
     * Carga la lista de vehículos activos desde Firestore y los muestra.
     */
    const fetchActiveVehicles = async () => {
        if (!db || !userId) return;
        try {
            const vehiclesCollection = collection(db, `artifacts/${appId}/public/data/vehiculosActivos`);
            const q = query(vehiclesCollection);
            const querySnapshot = await getDocs(q);
            const vehicleList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderActiveVehicles(vehicleList);
        } catch (e) {
            console.error("Error fetching active vehicles: ", e);
            showNotification('Error al cargar vehículos activos.', 'error');
        }
    };
    
    /**
     * Muestra el recibo en la interfaz de usuario.
     * @param {Object} data - Los datos del recibo a mostrar.
     */
    const showReceipt = (data) => {
        resultContent.innerHTML = `
            <div class="space-y-4 text-gray-700">
                <h3 class="text-lg font-bold text-center text-blue-600">Recibo de Salida</h3>
                <div class="bg-gray-50 p-4 rounded-lg shadow-sm">
                    <p><strong>Placa:</strong> ${data.placa}</p>
                    <p><strong>Tipo de Vehículo:</strong> ${data.tipoVehiculo}</p>
                    <p><strong>Hora de Entrada:</strong> ${new Date(data.horaEntrada).toLocaleString()}</p>
                    <p><strong>Hora de Salida:</strong> ${new Date(data.horaSalida).toLocaleString()}</p>
                    <p><strong>Tiempo de Estadía:</strong> ${data.tiempoEstadia}</p>
                    ${data.ajusteEspecial !== 0 ? `<p><strong>Ajuste Especial:</strong> ${data.ajusteEspecial >= 0 ? '+' : ''}$${formatNumber(data.ajusteEspecial)} COP</p>` : ''}
                </div>
                <div class="bg-blue-100 p-4 rounded-lg shadow-inner">
                    <h4 class="text-xl font-bold text-center text-blue-800">TOTAL A PAGAR: $${formatNumber(data.costoFinal)} COP</h4>
                </div>
            </div>
        `;
        resultDiv.classList.remove('hidden');
        receiptData = data;
    };

    //----------------------------------------------------------------------------------------------------
    // MANEJADORES DE EVENTOS
    //----------------------------------------------------------------------------------------------------

    // Manejador del formulario de login.
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        if (!auth) {
            showNotification('Error de conexión con la base de datos.', 'error');
            return;
        }
        try {
            await signInWithEmailAndPassword(auth, email, password);
            showNotification('Login exitoso.', 'success');
        } catch (error) {
            console.error("Error de login:", error.message);
            showNotification('Error de login. Por favor, revisa tus credenciales.', 'error');
        }
    });

    // Manejador del botón de logout.
    btnLogout.addEventListener('click', async () => {
        if (!auth) return;
        try {
            await signOut(auth);
            showNotification('Sesión cerrada.', 'info');
            loginSection.style.display = 'flex';
            mainApp.style.display = 'none';
        } catch (error) {
            console.error("Error al cerrar sesión:", error.message);
            showNotification('Error al cerrar sesión.', 'error');
        }
    });

    // Manejador del formulario de registro de entrada.
    entryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!db) {
            showNotification('Error de conexión con la base de datos.', 'error');
            return;
        }
        const placa = document.getElementById('placa-entrada').value.toUpperCase();
        const tipoVehiculo = document.getElementById('tipo-vehiculo-entrada').value;
        const horaEntrada = Date.now();

        // NUEVA FUNCIONALIDAD: Guardar el vehículo activo en Firestore.
        try {
            const docRef = await addDoc(collection(db, `artifacts/${appId}/public/data/vehiculosActivos`), {
                placa,
                tipoVehiculo,
                horaEntrada
            });
            showNotification('Vehículo registrado con éxito.', 'success');
            entryForm.reset();
            fetchActiveVehicles(); // Actualizar la lista de vehículos.
        } catch (e) {
            console.error("Error adding document: ", e);
            showNotification('Error al registrar el vehículo.', 'error');
        }
    });

    // Manejador de clics en la lista de vehículos activos (botón de salida).
    activeVehiclesList.addEventListener('click', async (e) => {
        if (e.target.closest('.exit-btn')) {
            const placa = e.target.closest('.exit-btn').dataset.placa;
            document.getElementById('placa-salida').value = placa;
            document.getElementById('salida-tab').click();
            exitForm.scrollIntoView({ behavior: 'smooth' });
            
            // NUEVA FUNCIONALIDAD: Buscar vehículo en Firestore para prellenar el formulario.
            if (!db) return;
            try {
                const q = query(collection(db, `artifacts/${appId}/public/data/vehiculosActivos`), where("placa", "==", placa));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const vehicleDoc = querySnapshot.docs[0];
                    const vehicleData = vehicleDoc.data();
                    document.getElementById('vehicle-type-exit').value = vehicleData.tipoVehiculo;
                    document.getElementById('entry-time').textContent = new Date(vehicleData.horaEntrada).toLocaleString();
                }
            } catch (e) {
                console.error("Error pre-filling exit form: ", e);
                showNotification('Error al cargar datos del vehículo.', 'error');
            }
        }
    });

    // Manejador del formulario de registro de salida.
    exitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!db) {
            showNotification('Error de conexión con la base de datos.', 'error');
            return;
        }
        const placa = document.getElementById('placa-salida').value.toUpperCase();
        const specialClient = specialClientCheckbox.checked;
        const ajusteEspecial = specialClient ? parseNumber(adjustmentsInput.value) : 0;
        const costoFinalManual = specialClient && totalInput.value ? parseNumber(totalInput.value) : null;

        // NUEVA FUNCIONALIDAD: Buscar el vehículo y calcular el costo.
        try {
            const q = query(collection(db, `artifacts/${appId}/public/data/vehiculosActivos`), where("placa", "==", placa));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                showNotification('Vehículo no encontrado.', 'error');
                return;
            }

            const vehicleDoc = querySnapshot.docs[0];
            const vehicleData = vehicleDoc.data();
            const horaSalida = Date.now();
            const tiempoEstadiaMs = horaSalida - vehicleData.horaEntrada;
            const tiempoEstadiaMin = Math.ceil(tiempoEstadiaMs / (1000 * 60));

            const price = currentPrices.find(p => p.tipoVehiculo === vehicleData.tipoVehiculo);
            if (!price) {
                showNotification('Tarifa no encontrada para este tipo de vehículo.', 'error');
                return;
            }

            let costoOriginal;
            let tiempoEstadiaTexto;
            
            // NUEVA LÓGICA DE COBRO: Cobro por bloques de 30 minutos o por tarifa fija.
            if (price.tarifaFija) {
                // Si es una tarifa fija, el costo es el valor de la tarifa.
                costoOriginal = price.tarifaFija;
                tiempoEstadiaTexto = `${price.tiempoFijo}`;
            } else {
                // Lógica de cobro por bloques de 30 minutos.
                const tarifaMediaHora = price.tarifaMinuto * 30;
                if (tiempoEstadiaMin < 30) {
                    costoOriginal = 0;
                } else {
                    const numBloques = Math.ceil(tiempoEstadiaMin / 30);
                    costoOriginal = numBloques * tarifaMediaHora;
                }
                tiempoEstadiaTexto = `${Math.floor(tiempoEstadiaMin / 60)} horas, ${tiempoEstadiaMin % 60} minutos`;
            }

            const costoFinal = costoFinalManual !== null ? costoFinalManual : (costoOriginal + ajusteEspecial);

            const data = {
                placa,
                tipoVehiculo: vehicleData.tipoVehiculo,
                horaEntrada: vehicleData.horaEntrada,
                horaSalida,
                tiempoEstadia: tiempoEstadiaTexto,
                costoOriginal,
                ajusteEspecial,
                costoFinal,
                esClienteEspecial: specialClient
            };

            showReceipt(data);
            
            // NUEVA FUNCIONALIDAD: Eliminar el vehículo de la base de datos de "vehiculosActivos".
            await deleteDoc(doc(db, `artifacts/${appId}/public/data/vehiculosActivos`, vehicleDoc.id));
            
            // NUEVA FUNCIONALIDAD: Guardar el recibo en la base de datos de "recibos".
            await addDoc(collection(db, `artifacts/${appId}/public/data/recibos`), data);
            
            showNotification('Recibo generado y guardado. Vehículo retirado.', 'success');
            exitForm.reset();
            specialClientCheckbox.checked = false;
            specialClientDetails.classList.add('hidden');
            totalInput.value = '';
            adjustmentsInput.value = '';
            resultDiv.classList.remove('hidden');
            fetchActiveVehicles(); // Actualizar la lista después de la salida.
        } catch (e) {
            console.error("Error al procesar la salida:", e);
            showNotification('Error al procesar la salida. Intenta de nuevo.', 'error');
        }
    });

    // Manejador del checkbox de cliente especial.
    specialClientCheckbox.addEventListener('change', () => {
        if (specialClientCheckbox.checked) {
            specialClientDetails.classList.remove('hidden');
        } else {
            specialClientDetails.classList.add('hidden');
        }
    });

    // Manejador del botón de imprimir recibo (PDF).
    printReceiptBtn.addEventListener('click', () => {
        if (!receiptData) {
            showNotification('No hay recibo para imprimir.', 'info');
            return;
        }

        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Recibo de Parqueadero', 105, 20, null, null, 'center');
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150);
        doc.text(`ID: ${receiptData.id || 'N/A'}`, 105, 25, null, null, 'center');
        
        let y = 40;
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(`Fecha: ${new Date(receiptData.horaSalida).toLocaleDateString()}`, 20, y);
        y += 7;
        doc.text(`Hora: ${new Date(receiptData.horaSalida).toLocaleTimeString()}`, 20, y);
        y += 10;
        doc.text(`Placa: ${receiptData.placa}`, 20, y);
        y += 7;
        doc.text(`Tipo de Vehículo: ${receiptData.tipoVehiculo}`, 20, y);
        y += 7;
        doc.text(`Hora de Entrada: ${new Date(receiptData.horaEntrada).toLocaleString()}`, 20, y);
        y += 7;
        doc.text(`Hora de Salida: ${new Date(receiptData.horaSalida).toLocaleString()}`, 20, y);
        y += 10;
        
        if (receiptData.esClienteEspecial) {
            doc.text(`Tiempo de Estadía: ${receiptData.tiempoEstadia}`, 20, y);
            y += 7;
            doc.text(`Ajuste Especial: ${receiptData.ajusteEspecial >= 0 ? '+' : ''}$${formatNumber(receiptData.ajusteEspecial)} COP`, 20, y);
            y += 10;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(52, 152, 219);
            doc.text(`TOTAL A PAGAR: $${formatNumber(receiptData.costoFinal)} COP`, 20, y);
            y += 20;
        } else {
            doc.text(`Tiempo de Estadía: ${receiptData.tiempoEstadia}`, 20, y);
            y += 7;
            doc.text(`Costo Original: $${formatNumber(receiptData.costoOriginal)} COP`, 20, y);
            y += 7;
            doc.text(`Ajuste Especial: ${receiptData.ajusteEspecial >= 0 ? '+' : ''}$${formatNumber(receiptData.ajusteEspecial)} COP`, 20, y);
            y += 10;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(52, 152, 219);
            doc.text(`TOTAL A PAGAR: $${formatNumber(receiptData.costoFinal)} COP`, 20, y);
            y += 20;
        }

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text('¡Gracias por su visita!', 105, y, null, null, 'center');
        y += 5;
        doc.text('Medellín, Antioquia, Colombia', 105, y, null, null, 'center');
        
        doc.save(`Recibo-${receiptData.placa}.pdf`);
    });

    // Manejador del botón de la pestaña de administración.
    adminTabButton.addEventListener('click', async () => {
        document.getElementById('admin-tab').classList.add('active-tab');
        document.getElementById('operaciones-tab').classList.remove('active-tab');
        document.getElementById('operaciones-content').classList.add('hidden');
        document.getElementById('admin-content').classList.remove('hidden');

        renderPrices(currentPrices);
    });

    // Manejador del botón de la pestaña de operaciones.
    document.getElementById('operaciones-tab-button').addEventListener('click', () => {
        document.getElementById('operaciones-tab').classList.add('active-tab');
        document.getElementById('admin-tab').classList.remove('active-tab');
        document.getElementById('admin-content').classList.add('hidden');
        document.getElementById('operaciones-content').classList.remove('hidden');
    });

    // Manejador de la pestaña de salida.
    document.getElementById('salida-tab').addEventListener('click', () => {
        document.getElementById('salida-content').classList.remove('hidden');
        document.getElementById('entrada-content').classList.add('hidden');
    });

    // Manejador de la pestaña de entrada.
    document.getElementById('entrada-tab').addEventListener('click', () => {
        document.getElementById('entrada-content').classList.remove('hidden');
        document.getElementById('salida-content').classList.add('hidden');
    });

    // Manejador del botón para cerrar el recibo.
    document.getElementById('close-result-btn').addEventListener('click', () => {
        resultDiv.classList.add('hidden');
        receiptData = null;
    });

    // Manejador del botón para crear una nueva tarifa.
    newPriceBtn.addEventListener('click', async () => {
        adminPricesSection.classList.add('hidden');
        editPricesSection.classList.remove('hidden');
        document.getElementById('edit-price-title').textContent = 'Crear Nueva Tarifa';
        newRateBtn.textContent = 'Crear Tarifa';
        newRateBtn.dataset.mode = 'new';
        newRateBtn.dataset.id = '';
        vehicleTypeSelect.value = 'Carro';
        hourlyRateInput.value = '';
        dailyRateInput.value = '';
        hourlyMinutesInput.value = '';
        vehicleTypeSelect.disabled = false;
        
        // NUEVA FUNCIONALIDAD: Llenar el select de tipos de vehículo con las opciones disponibles
        vehicleTypeSelect.innerHTML = '';
        const tiposVehiculoExistentes = currentPrices.map(p => p.tipoVehiculo);
        const opcionesDefault = ['Carro', 'Moto', 'Carro (12 horas)', 'Moto (12 horas)'];
        opcionesDefault.forEach(tipo => {
            const option = document.createElement('option');
            option.value = tipo;
            option.textContent = tipo;
            // Deshabilita los tipos de vehículo que ya tienen una tarifa
            if (tiposVehiculoExistentes.includes(tipo)) {
                 option.disabled = true;
            }
            vehicleTypeSelect.appendChild(option);
        });

    });

    // Manejador de clics en la lista de precios para editar.
    pricesList.addEventListener('click', (e) => {
        if (e.target.closest('.edit-price-btn')) {
            const id = e.target.closest('.edit-price-btn').dataset.id;
            const priceToEdit = currentPrices.find(p => p.id === id);
            if (priceToEdit) {
                adminPricesSection.classList.add('hidden');
                editPricesSection.classList.remove('hidden');
                document.getElementById('edit-price-title').textContent = 'Editar Tarifa';
                newRateBtn.textContent = 'Guardar Cambios';
                newRateBtn.dataset.mode = 'edit';
                newRateBtn.dataset.id = id;
                vehicleTypeSelect.value = priceToEdit.tipoVehiculo;
                
                // Limpia los campos antes de asignar los valores
                hourlyRateInput.value = '';
                dailyRateInput.value = '';
                hourlyMinutesInput.value = '';
                
                // Muestra los valores correctos dependiendo si es tarifa fija o por minuto
                if (priceToEdit.tarifaMinuto) {
                    hourlyRateInput.value = formatNumber(priceToEdit.tarifaMinuto * 60);
                    dailyRateInput.value = formatNumber(priceToEdit.tarifaMinuto * 60 * 24);
                    hourlyMinutesInput.value = priceToEdit.tarifaMinuto;
                } else if (priceToEdit.tarifaFija) {
                    // Para tarifas fijas, deshabilitamos la edición de los campos de tiempo
                    hourlyRateInput.disabled = true;
                    dailyRateInput.disabled = true;
                    hourlyMinutesInput.disabled = true;
                }
                
                vehicleTypeSelect.disabled = true;
            }
        }
    });

    // Manejador del botón para guardar nuevas tarifas o editar tarifas existentes.
    newRateBtn.addEventListener('click', async () => {
        const mode = newRateBtn.dataset.mode;
        const id = newRateBtn.dataset.id;
        const tipoVehiculo = vehicleTypeSelect.value;
        const tarifaMinuto = parseNumber(hourlyMinutesInput.value);

        // NUEVA FUNCIONALIDAD: Lógica para manejar las tarifas fijas de 12 horas.
        let tarifaData;
        if (tipoVehiculo.includes('(12 horas)')) {
            const tarifaPorHora = currentPrices.find(p => p.tipoVehiculo === tipoVehiculo.split(' ')[0])?.tarifaMinuto * 60;
            if (!tarifaPorHora) {
                showNotification(`No se ha definido una tarifa por minuto para el tipo base: ${tipoVehiculo.split(' ')[0]}.`, 'error');
                return;
            }
            tarifaData = { tipoVehiculo, tarifaFija: tarifaPorHora * 12, tiempoFijo: '12 horas' };
        } else {
            if (!tipoVehiculo || isNaN(tarifaMinuto) || tarifaMinuto <= 0) {
                showNotification('Por favor, ingresa una tarifa válida.', 'error');
                return;
            }
            tarifaData = { tipoVehiculo, tarifaMinuto };
        }

        if (!db) return;

        try {
            if (mode === 'new') {
                await setDoc(doc(db, `artifacts/${appId}/public/data/precios`, tipoVehiculo), tarifaData);
                showNotification('Tarifa creada con éxito.', 'success');
            } else if (mode === 'edit' && id) {
                await setDoc(doc(db, `artifacts/${appId}/public/data/precios`, id), tarifaData);
                showNotification('Tarifa actualizada con éxito.', 'success');
            }
            editPricesSection.classList.add('hidden');
            adminPricesSection.classList.remove('hidden');
            // La lista se actualizará automáticamente gracias a onSnapshot.
        } catch (e) {
            console.error("Error saving price: ", e);
            showNotification('Error al guardar la tarifa.', 'error');
        }
    });

    // Manejador del botón para volver a la sección de administración de tarifas.
    backToAdminBtn.addEventListener('click', () => {
        editPricesSection.classList.add('hidden');
        adminPricesSection.classList.remove('hidden');
    });

    // Manejador para el formato de los inputs de ajuste y costo final.
    adjustmentsInput.addEventListener('input', () => {
        adjustmentsInput.value = formatNumber(parseNumber(adjustmentsInput.value));
    });

    totalInput.addEventListener('input', () => {
        totalInput.value = formatNumber(parseNumber(totalInput.value));
    });

    // Cargar vehículos y precios al inicio si hay un usuario autenticado.
    if (auth && auth.currentUser) {
        fetchActiveVehicles();
        await fetchAndListenToPrices();
    }
});

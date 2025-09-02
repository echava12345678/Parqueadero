const { jsPDF } = window.jspdf;
import { collection, addDoc, getDocs, query, where, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    // Definición de la función de utilidad al inicio del script
    const formatNumber = (num) => new Intl.NumberFormat('es-CO').format(num);
    const parseNumber = (str) => parseInt(str.replace(/\./g, '')) || 0;

    // Definición de elementos del DOM
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
    const othersTypeContainer = document.getElementById('others-type-container');
    const vehicleTypeEntry = document.getElementById('type-entry');
    const othersVehicleSize = document.getElementById('others-vehicle-size');
    const othersMonthlyPrice = document.getElementById('others-monthly-price');
    const specialClientSection = document.getElementById('special-client-section');
    const specialClientAdjustment = document.getElementById('special-client-adjustment');
    const exitCostDisplay = document.getElementById('exit-cost-display');
    const plateEntryInput = document.getElementById('plate-entry');
    const plateLabel = document.getElementById('plate-label');
    const otherPriceLabel = document.getElementById('other-price-label');


    const vehicleSearchInput = document.getElementById('vehicle-search');

    if(vehicleSearchInput) {
        vehicleSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim().toUpperCase();
            if (searchTerm === '') {
                updateActiveVehiclesList('all');
            } else {
                const filteredVehicles = activeVehicles.filter(vehicle => 
                    (vehicle.plate && vehicle.plate.toUpperCase().includes(searchTerm)) ||
                    (vehicle.description && vehicle.description.toUpperCase().includes(searchTerm))
                );
                updateActiveVehiclesList('all', filteredVehicles);
            }
        });
    }
    // Tarifas iniciales con estructura completa
    let prices = {
        carro: {
            mediaHora: 3000,
            hora: 6000,
            doceHoras: 30000,
            mes: 250000
        },
        moto: {
            mediaHora: 2000,
            hora: 4000,
            doceHoras: 15000,
            mes: 150000 
        },
        'otros-mensualidad': {
            'pequeño': { min: 100000, max: 150000, mes: 120000 },
            'mediano': { min: 151000, max: 200000, mes: 180000 },
            'grande': { min: 201000, max: 300000, mes: 250000 }
        },
        'otros-noche': {
            'pequeño': { min: 10000, max: 15000, noche: 12000 },
            'mediano': { min: 15100, max: 20000, noche: 18000 },
            'grande': { min: 20100, max: 30000, noche: 25000 }
        }
    };

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                // Usuarios del sistema
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                const users = {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    'admin': 'admin123',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    'trabajador': 'trabajador123'
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                };
    
    // Declaración de la variable para vehículos activos
    let activeVehicles = [];

    const showNotification = (message, type = 'info') => {
        notificationArea.textContent = message;
        notificationArea.className = `message ${type}-message`;
        notificationArea.style.display = 'block';
        notificationArea.classList.add('fade-in');
        setTimeout(() => {
            notificationArea.style.display = 'none';
        }, 5000);
    };

   const updateActiveVehiclesList = (filterType = 'all', vehicleList = null) => {
    activeVehiclesList.innerHTML = '';
    const vehiclesToDisplay = vehicleList || activeVehicles.filter(v => {
        if (filterType === 'all') return true;
        if (filterType === 'mensualidad') {
            return v.type.includes('mensualidad');
        }
        if (filterType === 'otros-noche') {
            return v.type.includes('otros-noche');
        }
        return v.type === filterType;
    });

    if (vehiclesToDisplay.length === 0) {
        activeVehiclesList.innerHTML = '<li><i class="fas fa-info-circle"></i> No hay vehículos activos de este tipo.</li>';
    } else {
        vehiclesToDisplay.forEach(v => {
            const li = document.createElement('li');
            let extraInfo = '';
            let displayPlate = v.plate;
            if (v.type.includes('mensualidad')) {
                const entryDate = new Date(v.entryTime);
                const nextPaymentDate = new Date(entryDate);
                nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
                extraInfo = `<br>Próximo pago: <strong>${nextPaymentDate.toLocaleDateString('es-CO')}</strong>`;
            }
            if (v.type.includes('otros')) {
                displayPlate = v.description;
            }
            li.innerHTML = `<span>Placa/Descripción: <strong>${displayPlate}</strong></span> <span>Tipo: ${v.type}</span> <span>Entrada: ${new Date(v.entryTime).toLocaleString()}${extraInfo}</span>`;
            activeVehiclesList.appendChild(li);
        });
    }
};

    // Cargar tarifas y vehículos desde localStorage (manteniendo el de precios en localStorage)
    const loadData = async () => {
        const storedPrices = localStorage.getItem('parkingPrices');
        if (storedPrices) {
            prices = JSON.parse(storedPrices);
        }

        // Cargar precios en los campos de administración
        if (prices.carro) {
            document.getElementById('car-half-hour').value = prices.carro.mediaHora;
            document.getElementById('car-hour').value = prices.carro.hora;
            document.getElementById('car-12h').value = prices.carro.doceHoras;
            document.getElementById('car-month').value = prices.carro.mes;
        }
        if (prices.moto) {
            document.getElementById('bike-half-hour').value = prices.moto.mediaHora;
            document.getElementById('bike-hour').value = prices.moto.hora;
            document.getElementById('bike-12h').value = prices.moto.doceHoras;
            document.getElementById('bike-month').value = prices.moto.mes;
        }
        if (prices['otros-mensualidad']) {
            document.getElementById('other-small-min').value = prices['otros-mensualidad'].pequeño.min;
            document.getElementById('other-small-max').value = prices['otros-mensualidad'].pequeño.max;
            document.getElementById('other-small-default').value = prices['otros-mensualidad'].pequeño.mes;
            document.getElementById('other-medium-min').value = prices['otros-mensualidad'].mediano.min;
            document.getElementById('other-medium-max').value = prices['otros-mensualidad'].mediano.max;
            document.getElementById('other-medium-default').value = prices['otros-mensualidad'].mediano.mes;
            document.getElementById('other-large-min').value = prices['otros-mensualidad'].grande.min;
            document.getElementById('other-large-max').value = prices['otros-mensualidad'].grande.max;
            document.getElementById('other-large-default').value = prices['otros-mensualidad'].grande.mes;
        }
        if (prices['otros-noche']) {
            document.getElementById('other-night-small-min').value = prices['otros-noche'].pequeño.min;
            document.getElementById('other-night-small-max').value = prices['otros-noche'].pequeño.max;
            document.getElementById('other-night-small-default').value = prices['otros-noche'].pequeño.noche;
            document.getElementById('other-night-medium-min').value = prices['otros-noche'].mediano.min;
            document.getElementById('other-night-medium-max').value = prices['otros-noche'].mediano.max;
            document.getElementById('other-night-medium-default').value = prices['otros-noche'].mediano.noche;
            document.getElementById('other-night-large-min').value = prices['otros-noche'].grande.min;
            document.getElementById('other-night-large-max').value = prices['otros-noche'].grande.max;
            document.getElementById('other-night-large-default').value = prices['otros-noche'].grande.noche;
        }
        
        // Cargar vehículos desde Firestore
        const vehiclesCol = collection(window.db, 'activeVehicles');
        const vehicleSnapshot = await getDocs(vehiclesCol);
        activeVehicles = vehicleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        updateActiveVehiclesList();
    };

    // Filtros de vehículos activos
    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.filter-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const filterType = button.dataset.filter;
            updateActiveVehiclesList(filterType);
        });
    });

    // Manejo de pestañas
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.style.display = 'none');

            button.classList.add('active');
            const targetTabId = button.dataset.tab;
            document.getElementById(targetTabId).style.display = 'block';
            document.getElementById(targetTabId).classList.add('fade-in');

            if (targetTabId === 'active-vehicles-tab') {
                updateActiveVehiclesList('all');
                document.querySelector('.filter-button[data-filter="all"]').classList.add('active');
            }
        });
    });

    // Funciones de Autenticación
    const login = (username, password) => {
        if (users[username] === password) {
            localStorage.setItem('currentUser', username);
            loginMessage.style.display = 'none';
            showApp(username);
        } else {
            loginMessage.textContent = 'Usuario o contraseña incorrectos.';
            loginMessage.className = 'message error-message fade-in';
            loginMessage.style.display = 'block';
        }
    };

    const showApp = (user) => {
        loginSection.style.display = 'none';
        mainApp.style.display = 'block';
        btnLogin.style.display = 'none';
        btnLogout.style.display = 'inline';

        if (user === 'admin') {
            adminTabButton.style.display = 'inline-flex';
        } else {
            adminTabButton.style.display = 'none';
        }
        document.querySelector('.tab-button[data-tab="entry-exit-tab"]').click();
        updateActiveVehiclesList('all');
    };

    const logout = () => {
        localStorage.removeItem('currentUser');
        loginSection.style.display = 'block';
        mainApp.style.display = 'none';
        btnLogin.style.display = 'inline';
        btnLogout.style.display = 'none';
        resultDiv.style.display = 'none';
        loginForm.reset();
    };

    // Manejadores de eventos
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        login(username, password);
    });

    btnLogout.addEventListener('click', logout);
    
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
        showApp(currentUser);
    } else {
        loginSection.style.display = 'block';
        mainApp.style.display = 'none';
    }

    // Guardar tarifas del administrador
    savePricesBtn.addEventListener('click', () => {
        
        prices.carro = {
            mediaHora: parseNumber(document.getElementById('car-half-hour').value),
            hora: parseNumber(document.getElementById('car-hour').value),
            doceHoras: parseNumber(document.getElementById('car-12h').value),
            mes: parseNumber(document.getElementById('car-month').value)
        };
        
        prices.moto = {
            mediaHora: parseNumber(document.getElementById('bike-half-hour').value),
            hora: parseNumber(document.getElementById('bike-hour').value),
            doceHoras: parseNumber(document.getElementById('bike-12h').value),
            mes: parseNumber(document.getElementById('bike-month').value)
        };

        prices['otros-mensualidad'] = {
            'pequeño': { min: parseNumber(document.getElementById('other-small-min').value), max: parseNumber(document.getElementById('other-small-max').value), mes: parseNumber(document.getElementById('other-small-default').value) },
            'mediano': { min: parseNumber(document.getElementById('other-medium-min').value), max: parseNumber(document.getElementById('other-medium-max').value), mes: parseNumber(document.getElementById('other-medium-default').value) },
            'grande': { min: parseNumber(document.getElementById('other-large-min').value), max: parseNumber(document.getElementById('other-large-max').value), mes: parseNumber(document.getElementById('other-large-default').value) }
        };
        
        prices['otros-noche'] = {
            'pequeño': { min: parseNumber(document.getElementById('other-night-small-min').value), max: parseNumber(document.getElementById('other-night-small-max').value), noche: parseNumber(document.getElementById('other-night-small-default').value) },
            'mediano': { min: parseNumber(document.getElementById('other-night-medium-min').value), max: parseNumber(document.getElementById('other-night-medium-max').value), noche: parseNumber(document.getElementById('other-night-medium-default').value) },
            'grande': { min: parseNumber(document.getElementById('other-night-large-min').value), max: parseNumber(document.getElementById('other-night-large-max').value), noche: parseNumber(document.getElementById('other-night-large-default').value) }
        };

        localStorage.setItem('parkingPrices', JSON.stringify(prices));
        showNotification('Tarifas actualizadas correctamente.', 'success');
        
        loadData();
    });

    // Mostrar/ocultar campos de otros vehículos y cambiar placeholder
    vehicleTypeEntry.addEventListener('change', () => {
        const selectedType = vehicleTypeEntry.value;
        if (selectedType === 'otros-mensualidad' || selectedType === 'otros-noche') {
            othersTypeContainer.style.display = 'flex';
            plateLabel.textContent = "Descripción:";
            plateEntryInput.placeholder = "Ej: Puesto de comida, Carro de helados";
            if (selectedType === 'otros-mensualidad') {
                otherPriceLabel.textContent = "Precio (Mensualidad):";
                othersMonthlyPrice.placeholder = "Precio acordado";
            } else {
                otherPriceLabel.textContent = "Precio (Por Noche):";
                othersMonthlyPrice.placeholder = "Precio acordado";
            }
        } else {
            othersTypeContainer.style.display = 'none';
            plateLabel.textContent = "Placa:";
            plateEntryInput.placeholder = "Ej: ABC-123";
        }
    });

    // Registrar entrada de vehículo
    entryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const plate = document.getElementById('plate-entry').value.trim().toUpperCase();
        const type = document.getElementById('type-entry').value;

        let description = '';
        if (['otros-mensualidad', 'otros-noche'].includes(type)) {
            description = plate;
        }

        // --- VERIFICA SI EL VEHÍCULO YA EXISTE EN FIRESTORE ---
        const q = query(collection(window.db, 'activeVehicles'), where("plate", "==", plate));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty && !['otros-mensualidad', 'otros-noche'].includes(type)) {
            showNotification(`¡La placa ${plate} ya se encuentra registrada!`, 'error');
            return;
        }

        let otherVehicleSize = null;
        let otherPrice = null;

        if (type === 'otros-mensualidad' || type === 'otros-noche') {
            otherVehicleSize = othersVehicleSize.value;
            const priceValue = othersMonthlyPrice.value;
            if (!priceValue) {
                showNotification("Por favor, ingrese un precio para el vehículo.", 'error');
                return;
            }
            otherPrice = parseNumber(priceValue);
            
            const sizePrices = prices[type][otherVehicleSize];
            if (otherPrice < sizePrices.min || otherPrice > sizePrices.max) {
                showNotification(`El precio debe estar entre $${formatNumber(sizePrices.min)} y $${formatNumber(sizePrices.max)} COP.`, 'error');
                return;
            }
        }

        const newVehicle = {
            plate,
            description,
            type,
            entryTime: new Date().toISOString(),
            price: otherPrice,
            size: otherVehicleSize
        };
        
        // --- AGREGA EL DOCUMENTO A LA COLECCIÓN 'activeVehicles' EN FIRESTORE ---
        try {
            const docRef = await addDoc(collection(window.db, 'activeVehicles'), newVehicle);
            showNotification(`Entrada de ${type} con placa ${plate} registrada.`, 'success');
            entryForm.reset();
            othersTypeContainer.style.display = 'none';
            await loadData();
        } catch (e) {
            console.error("Error al añadir documento: ", e);
            showNotification("Error al registrar el vehículo. Por favor, intente de nuevo.", 'error');
        }
    });

    // Controlar visibilidad de la sección de cliente especial
    let currentCalculatedCost = 0;
    document.getElementById('plate-exit').addEventListener('input', () => {
        const plate = document.getElementById('plate-exit').value.trim().toUpperCase();
        const vehicle = activeVehicles.find(v => v.plate === plate);
        if (vehicle && !['mensualidad', 'moto-mensualidad', 'otros-mensualidad', 'otros-noche'].includes(vehicle.type)) {
            specialClientSection.style.display = 'flex';
        } else {
            specialClientSection.style.display = 'none';
            specialClientCheckbox.checked = false;
        }
    });

    // Calcular costo en tiempo real con ajustes de cliente especial
    const updateCalculatedCost = () => {
        const plate = document.getElementById('plate-exit').value.trim().toUpperCase();
        const vehicle = activeVehicles.find(v => v.plate === plate);
        if (!vehicle || ['mensualidad', 'moto-mensualidad', 'otros-mensualidad', 'otros-noche'].includes(vehicle.type)) {
            exitCostDisplay.innerHTML = '';
            specialClientSection.style.display = 'none';
            return;
        }

        const exitTime = new Date();
        const entryTime = new Date(vehicle.entryTime);
        const diffInMs = exitTime - entryTime;
        const diffInMinutes = Math.round(diffInMs / (1000 * 60));

        let totalCost = 0;

        if (diffInMinutes <= 30) {
            totalCost = 0;
        } else if (diffInMinutes > 30 && diffInMinute <= 60) {
            totalCost = prices[vehicle.type].mediaHora;
        } else {
            
            const pricePerHour = prices[vehicleType].hora;
            const priceFor12Hours = prices[vehicleType].doceHoras;
            
            const totalHours = Math.ceil(diffInMinutes / 60);
            totalCost = totalHours * pricePerHour;
            
            if (diffInMinutes >= 720) {
                totalCost = priceFor12Hours;
            }
        }
        
        let originalCost = totalCost;

        if (specialClientCheckbox.checked) {
            const adjustmentValue = parseNumber(specialClientAdjustment.value) || 0;
            totalCost = originalCost + adjustmentValue;
            if (adjustmentValue < 0) {
                showNotification(`Descuento de $${formatNumber(Math.abs(adjustmentValue))} COP aplicado.`, 'info');
            } else if (adjustmentValue > 0) {
                showNotification(`Aumento de $${formatNumber(adjustmentValue)} COP aplicado.`, 'info');
            }
        } else {
            notificationArea.style.display = 'none';
        }

        currentCalculatedCost = totalCost;
        exitCostDisplay.innerHTML = `Total a Pagar: <strong>$${formatNumber(totalCost)} COP</strong>`;
    };

    specialClientCheckbox.addEventListener('change', updateCalculatedCost);
    specialClientAdjustment.addEventListener('input', updateCalculatedCost);

    document.getElementById('plate-exit').addEventListener('input', updateCalculatedCost);

    // Registrar salida y calcular costo
    exitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const plate = document.getElementById('plate-exit').value.trim().toUpperCase();
        const vehicle = activeVehicles.find(v => v.plate === plate || v.description === plate);

        if (!vehicle) {
            showNotification('Placa/Descripción no encontrada. Por favor, verifique e intente de nuevo.', 'error');
            return;
        }

        const exitTime = new Date();
        const entryTime = new Date(vehicle.entryTime);
        const diffInMs = exitTime - entryTime;
        const diffInMinutes = Math.round(diffInMs / (1000 * 60));
        
        let totalCost = 0;
        let originalCost = 0;
        const isSpecialClient = specialClientCheckbox.checked;
        const adjustmentValue = parseNumber(specialClientAdjustment.value) || 0;

        let resultHTML = '';
        let receiptData = {};
        let displayPlate = vehicle.plate;
        if (vehicle.type.includes('otros')) {
            displayPlate = vehicle.description;
        }


        if (['mensualidad', 'moto-mensualidad', 'otros-mensualidad'].includes(vehicle.type)) {
            let monthlyPrice = 0;
            if (vehicle.type === 'mensualidad') {
                monthlyPrice = prices.carro.mes;
            } else if (vehicle.type === 'moto-mensualidad') {
                monthlyPrice = prices.moto.mes;
            } else {
                monthlyPrice = vehicle.price;
            }

            const nextPaymentDate = new Date(vehicle.entryTime);
            nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

            resultHTML = `
                <p>Placa/Descripción: <strong>${displayPlate}</strong></p>
                <p>Tipo: <strong>${vehicle.type}</strong></p>
                <p>Valor mensualidad: <strong>$${formatNumber(monthlyPrice)} COP</strong></p>
                <p>Día de pago próximo: <strong>${nextPaymentDate.toLocaleDateString('es-CO')}</strong></p>
                <p class="info-message"><strong>Salida registrada. No se aplica cargo por hora.</strong></p>
            `;
            totalCost = 0;
            
            receiptData = {
                plate: displayPlate,
                type: vehicle.type,
                entryTime,
                exitTime,
                costoFinal: 0,
                descuento: 0,
                esMensualidad: true,
                costoOriginal: monthlyPrice,
                proximoPago: nextPaymentDate
            };
        } else if (vehicle.type === 'otros-noche') {
            const nightPrice = vehicle.price;
            resultHTML = `
                <p>Descripción: <strong>${displayPlate}</strong></p>
                <p>Tipo: <strong>${vehicle.type}</strong></p>
                <p>Valor por noche: <strong>$${formatNumber(nightPrice)} COP</strong></p>
                <p class="info-message"><strong>Salida registrada. Tarifa plana nocturna.</strong></p>
            `;
            totalCost = nightPrice;
            
            receiptData = {
                plate: displayPlate,
                type: vehicle.type,
                entryTime,
                exitTime,
                costoFinal: totalCost,
                esGratis: false,
                esMensualidad: false,
                esNoche: true,
                costoOriginal: nightPrice
            };

        } else { // Carros y Motos por hora
            if (diffInMinutes <= 30) {
                totalCost = 0;
                resultHTML = `
                    <p>Placa: <strong>${vehicle.plate}</strong></p>
                    <p>Tipo: <strong>${vehicle.type}</strong></p>
                    <p>Tiempo de estadía: <strong>${diffInMinutes} minutos</strong></p>
                    <p class="info-message">El vehículo no ha superado la media hora de estadía.</p>
                    <p>Total a pagar: <strong>$0 COP</strong></p>
                `;
                
                receiptData = {
                    plate: vehicle.plate,
                    type: vehicle.type,
                    entryTime,
                    exitTime,
                    costoFinal: 0,
                    descuento: 0,
                    esGratis: true,
                    tiempoEstadia: `${diffInMinutes} minutos`
                };

            } else {
                const vehicleType = vehicle.type;

                // Nuevo cálculo de costo: primero media hora, luego horas completas
                if (diffInMinutes <= 60) {
                    totalCost = prices[vehicleType].mediaHora;
                } else {
                    const totalHours = Math.ceil(diffInMinutes / 60);
                    totalCost = totalHours * prices[vehicleType].hora;
                }
                
                if (diffInMinutes >= 720) {
                    totalCost = prices[vehicleType].doceHoras;
                }
                
                originalCost = totalCost;
                
                if (isSpecialClient) {
                    totalCost = originalCost + adjustmentValue;
                }

                const totalHoursDisplay = Math.floor(diffInMinutes / 60);
                const totalMinutesDisplay = diffInMinutes % 60;

                resultHTML = `
                    <p>Placa: <strong>${vehicle.plate}</strong></p>
                    <p>Tipo: <strong>${vehicle.type}</strong></p>
                    <p>Tiempo de estadía: <strong>${totalHoursDisplay} horas y ${totalMinutesDisplay} minutos</strong></p>
                    <p>Costo calculado (sin ajuste): <strong>$${formatNumber(originalCost)} COP</strong></p>
                `;
                
                if (isSpecialClient) {
                    resultHTML += `<p>Ajuste por cliente especial: <strong>${adjustmentValue >= 0 ? '+' : ''}$${formatNumber(adjustmentValue)} COP</strong></p>`;
                }
                
                resultHTML += `<p>Total a pagar: <strong>$${formatNumber(totalCost)} COP</strong></p>`;

                receiptData = {
                    plate: vehicle.plate,
                    type: vehicle.type,
                    entryTime,
                    exitTime,
                    costoFinal: totalCost,
                    descuento: adjustmentValue < 0 ? Math.abs(adjustmentValue) : 0,
                    esGratis: false,
                    esMensualidad: false,
                    costoOriginal: originalCost,
                    ajusteEspecial: adjustmentValue,
                    tiempoEstadia: `${totalHoursDisplay} horas y ${totalMinutesDisplay} minutos`
                };
            }
        }

        resultContent.innerHTML = resultHTML;
        resultDiv.style.display = 'block';
        resultDiv.classList.add('fade-in');

        // --- ELIMINA EL DOCUMENTO DE FIRESTORE ---
        try {
            await deleteDoc(doc(window.db, "activeVehicles", vehicle.id));
            showNotification(`Salida de ${displayPlate} registrada.`, 'success');
            await loadData(); // Recarga la lista de vehículos desde Firestore
        } catch (e) {
            console.error("Error al eliminar documento: ", e);
            showNotification("Error al registrar la salida. Por favor, intente de nuevo.", 'error');
        }

        exitForm.reset();
        specialClientCheckbox.checked = false;
        specialClientSection.style.display = 'none';
        specialClientAdjustment.value = '';
        exitCostDisplay.innerHTML = '';

        localStorage.setItem('lastReceipt', JSON.stringify(receiptData));
    });

    // Descargar recibo de pago en PDF
    printReceiptBtn.addEventListener('click', () => {
        const receiptData = JSON.parse(localStorage.getItem('lastReceipt'));
        if (!receiptData) {
            showNotification('No hay un recibo para descargar. Finalice una salida primero.', 'info');
            return;
        }

        const doc = new jsPDF();
        doc.setFont('helvetica');
        doc.setTextColor(44, 62, 80);

        doc.setFontSize(22);
        doc.text('Parqueadero El Reloj', 105, 20, null, null, 'center');
        doc.setFontSize(16);

        if (receiptData.esGratis) {
            doc.text('Salida Gratis', 105, 30, null, null, 'center');
        } else {
            doc.text('Recibo de Pago', 105, 30, null, null, 'center');
        }
        
        doc.setDrawColor(200, 200, 200);
        doc.line(20, 35, 190, 35);

        let y = 45;
        doc.setFontSize(12);
        doc.setTextColor(52, 73, 94);

        if (receiptData.esNoche || receiptData.esMensualidad) {
            doc.text(`Descripción: ${receiptData.plate}`, 20, y);
            y += 7;
        } else {
            doc.text(`Placa: ${receiptData.plate}`, 20, y);
            y += 7;
        }
        
        doc.text(`Tipo de Vehículo: ${receiptData.type.replace('-', ' ').toUpperCase()}`, 20, y);
        y += 10;
        doc.text(`Fecha de Entrada: ${new Date(receiptData.entryTime).toLocaleString('es-CO')}`, 20, y);
        y += 7;
        doc.text(`Fecha de Salida: ${new Date(receiptData.exitTime).toLocaleString('es-CO')}`, 20, y);
        y += 10;
        
        if (receiptData.esGratis) {
            doc.text(`Tiempo de Estadía: ${receiptData.tiempoEstadia}`, 20, y);
            y += 10;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(231, 76, 60); 
            doc.text('NO COMPLETÓ LA MEDIA HORA', 105, y, null, null, 'center');
            y += 7;
            doc.text('SU SALIDA ES GRATIS', 105, y, null, null, 'center');
            y += 10;
            doc.setFontSize(16);
            doc.text('TOTAL A PAGAR: $0 COP', 105, y, null, null, 'center');
            y += 20;
        } else if (receiptData.esMensualidad) {
            doc.text(`Tipo de Servicio: Mensualidad`, 20, y);
            y += 7;
            doc.text(`Valor Mensualidad: $${formatNumber(receiptData.costoOriginal)} COP`, 20, y);
            y += 7;
            doc.text(`Próximo Día de Pago: ${new Date(receiptData.proximoPago).toLocaleDateString('es-CO')}`, 20, y);
            y += 10;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(52, 152, 219);
            doc.text(`TOTAL A PAGAR: $${formatNumber(receiptData.costoFinal)} COP`, 20, y);
            y += 20;
        } else if (receiptData.esNoche) {
             doc.text(`Tarifa Plana por Noche: $${formatNumber(receiptData.costoOriginal)} COP`, 20, y);
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

        doc.save(`Recibo_Parqueadero_${receiptData.plate}.pdf`);
        showNotification('Recibo PDF generado con éxito.', 'success');
    });

    // Llamada inicial para cargar los datos y actualizar la lista de vehículos.
    // Esto se hace al final para asegurar que todas las funciones ya estén definidas.
    await loadData();
});

// Variabili globali
let allFlyers = [];
let filteredFlyers = [];
let selectedFlyers = new Set();

// Inizializzazione
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inizializzazione Amministrazione Volantini');
    loadFlyers();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', debounce(filterFlyers, 300));
}

// Debounce function per la ricerca
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Carica tutti i volantini
async function loadFlyers() {
    try {
        console.log('📋 Caricamento volantini...');
        showLoading(true);
        showAlert('', 'clear');
        
        const response = await fetch('/api/pdfs/admin/all-flyers');
        const data = await response.json();
        
        if (data.success) {
            allFlyers = data.flyers || [];
            filteredFlyers = [...allFlyers];
            selectedFlyers.clear();
            
            console.log(`✅ Caricati ${allFlyers.length} volantini`);
            
            renderFlyers();
            updateStats();
            updateDeleteButton();
            
            showAlert(`Caricati ${allFlyers.length} volantini`, 'success');
        } else {
            throw new Error(data.message || 'Errore nel caricamento');
        }
    } catch (error) {
        console.error('❌ Errore nel caricamento volantini:', error);
        showAlert(`Errore nel caricamento: ${error.message}`, 'danger');
        allFlyers = [];
        filteredFlyers = [];
        renderFlyers();
        updateStats();
    } finally {
        showLoading(false);
    }
}

// Mostra/nasconde loading
function showLoading(show) {
    const loadingContainer = document.getElementById('loadingContainer');
    const flyersGrid = document.getElementById('flyersGrid');
    
    if (show) {
        loadingContainer.style.display = 'block';
        flyersGrid.style.display = 'none';
    } else {
        loadingContainer.style.display = 'none';
        flyersGrid.style.display = 'grid';
    }
}

// Filtra i volantini in base alla ricerca
function filterFlyers() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredFlyers = [...allFlyers];
    } else {
        filteredFlyers = allFlyers.filter(flyer => {
            const searchableText = [
                flyer.displayName || '',
                flyer.title || '',
                flyer.store || '',
                flyer.category || '',
                flyer.source || '',
                flyer.originalName || ''
            ].join(' ').toLowerCase();
            
            return searchableText.includes(searchTerm);
        });
    }
    
    console.log(`🔍 Filtrati ${filteredFlyers.length}/${allFlyers.length} volantini`);
    renderFlyers();
    updateStats();
}

// Renderizza i volantini
function renderFlyers() {
    const flyersGrid = document.getElementById('flyersGrid');
    
    if (filteredFlyers.length === 0) {
        flyersGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 50px; color: #6c757d;">
                <h3>📭 Nessun volantino trovato</h3>
                <p>Non ci sono volantini che corrispondono ai criteri di ricerca.</p>
            </div>
        `;
        return;
    }
    
    flyersGrid.innerHTML = filteredFlyers.map(flyer => createFlyerCard(flyer)).join('');
}

// Crea una card per il volantino
function createFlyerCard(flyer) {
    const isSelected = selectedFlyers.has(flyer._id);
    const uploadDate = flyer.uploadDate || flyer.createdAt || flyer.dataInizio;
    const formattedDate = uploadDate ? new Date(uploadDate).toLocaleDateString('it-IT') : 'N/A';
    const fileSize = flyer.fileSize ? formatFileSize(flyer.fileSize) : 'N/A';
    
    return `
        <div class="flyer-card ${isSelected ? 'selected' : ''}" data-id="${flyer._id}">
            <input type="checkbox" class="flyer-checkbox" 
                   ${isSelected ? 'checked' : ''} 
                   onchange="toggleFlyer('${flyer._id}', '${flyer.source}')">
            
            <div class="flyer-source source-${flyer.source}">
                ${getSourceLabel(flyer.source)}
            </div>
            
            <div class="flyer-title">
                ${escapeHtml(flyer.displayName || 'Volantino senza nome')}
            </div>
            
            <div class="flyer-info">
                <strong>Negozio:</strong> ${escapeHtml(flyer.store || 'N/A')}
            </div>
            
            ${flyer.category ? `
                <div class="flyer-info">
                    <strong>Categoria:</strong> ${escapeHtml(flyer.category)}
                </div>
            ` : ''}
            
            <div class="flyer-info">
                <strong>Data:</strong> ${formattedDate}
            </div>
            
            <div class="flyer-info">
                <strong>Dimensione:</strong> ${fileSize}
            </div>
            
            ${flyer.validFrom && flyer.validTo ? `
                <div class="flyer-info">
                    <strong>Validità:</strong> ${new Date(flyer.validFrom).toLocaleDateString('it-IT')} - ${new Date(flyer.validTo).toLocaleDateString('it-IT')}
                </div>
            ` : ''}
            
            <div class="flyer-actions">
                ${flyer.pdfPath || flyer.filename ? `
                    <button class="btn btn-primary btn-small" onclick="viewPDF('${flyer._id}', '${flyer.source}')">
                        👁️ Visualizza
                    </button>
                ` : ''}
                
                <button class="btn btn-danger btn-small" onclick="deleteSingleFlyer('${flyer._id}', '${flyer.source}')">
                    🗑️ Elimina
                </button>
            </div>
        </div>
    `;
}

// Ottieni l'etichetta della sorgente
function getSourceLabel(source) {
    const labels = {
        'upload': 'Caricato',
        'eurospin': 'Eurospin',
        'deco': 'Decò',
        'ipercoop': 'Ipercoop'
    };
    return labels[source] || source;
}

// Escape HTML per sicurezza
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Formatta la dimensione del file
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Toggle selezione volantino
function toggleFlyer(flyerId, source) {
    const flyerKey = flyerId;
    
    if (selectedFlyers.has(flyerKey)) {
        selectedFlyers.delete(flyerKey);
    } else {
        selectedFlyers.add(flyerKey);
    }
    
    updateFlyerCardSelection(flyerId);
    updateStats();
    updateDeleteButton();
}

// Aggiorna la selezione visiva della card
function updateFlyerCardSelection(flyerId) {
    const card = document.querySelector(`[data-id="${flyerId}"]`);
    if (card) {
        const isSelected = selectedFlyers.has(flyerId);
        card.classList.toggle('selected', isSelected);
        
        const checkbox = card.querySelector('.flyer-checkbox');
        if (checkbox) {
            checkbox.checked = isSelected;
        }
    }
}

// Seleziona tutti i volantini
function selectAll() {
    filteredFlyers.forEach(flyer => {
        selectedFlyers.add(flyer._id);
    });
    
    renderFlyers();
    updateStats();
    updateDeleteButton();
    
    showAlert(`Selezionati ${filteredFlyers.length} volantini`, 'info');
}

// Deseleziona tutti i volantini
function deselectAll() {
    selectedFlyers.clear();
    
    renderFlyers();
    updateStats();
    updateDeleteButton();
    
    showAlert('Tutti i volantini deselezionati', 'info');
}

// Aggiorna le statistiche
function updateStats() {
    const totalCount = allFlyers.length;
    const selectedCount = selectedFlyers.size;
    const uploadCount = allFlyers.filter(f => f.source === 'upload').length;
    const scraperCount = totalCount - uploadCount;
    
    document.getElementById('totalCount').textContent = totalCount;
    document.getElementById('selectedCount').textContent = selectedCount;
    document.getElementById('uploadCount').textContent = uploadCount;
    document.getElementById('scraperCount').textContent = scraperCount;
}

// Aggiorna il bottone di eliminazione
function updateDeleteButton() {
    const deleteBtn = document.getElementById('deleteBtn');
    const selectedCount = selectedFlyers.size;
    
    deleteBtn.disabled = selectedCount === 0;
    deleteBtn.textContent = selectedCount > 0 
        ? `🗑️ Elimina Selezionati (${selectedCount})`
        : '🗑️ Elimina Selezionati';
}

// Mostra modal di conferma eliminazione
function confirmDelete() {
    if (selectedFlyers.size === 0) {
        showAlert('Nessun volantino selezionato', 'danger');
        return;
    }
    
    document.getElementById('deleteCount').textContent = selectedFlyers.size;
    document.getElementById('deleteModal').style.display = 'block';
}

// Chiudi modal di eliminazione
function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
}

// Esegui eliminazione
async function executeDelete() {
    try {
        closeDeleteModal();
        showLoading(true);
        
        const flyersToDelete = Array.from(selectedFlyers).map(flyerId => {
            const flyer = allFlyers.find(f => f._id === flyerId);
            return {
                id: flyerId,
                source: flyer ? flyer.source : 'upload'
            };
        });
        
        console.log(`🗑️ Eliminazione di ${flyersToDelete.length} volantini...`);
        
        const response = await fetch('/api/pdfs/admin/delete-flyers', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ flyerIds: flyersToDelete })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Eliminati ${data.deletedCount} volantini`);
            
            let message = `Eliminati ${data.deletedCount} volantini su ${data.totalRequested} richiesti`;
            if (data.errors && data.errors.length > 0) {
                message += `. Errori: ${data.errors.length}`;
                console.warn('⚠️ Errori durante eliminazione:', data.errors);
            }
            
            showAlert(message, data.errors && data.errors.length > 0 ? 'info' : 'success');
            
            // Ricarica i volantini
            await loadFlyers();
        } else {
            throw new Error(data.message || 'Errore nell\'eliminazione');
        }
    } catch (error) {
        console.error('❌ Errore nell\'eliminazione:', error);
        showAlert(`Errore nell'eliminazione: ${error.message}`, 'danger');
    } finally {
        showLoading(false);
    }
}

// Elimina singolo volantino
async function deleteSingleFlyer(flyerId, source) {
    if (!confirm('Sei sicuro di voler eliminare questo volantino?')) {
        return;
    }
    
    try {
        showLoading(true);
        
        const response = await fetch('/api/pdfs/admin/delete-flyers', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                flyerIds: [{ id: flyerId, source: source }] 
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.deletedCount > 0) {
            showAlert('Volantino eliminato con successo', 'success');
            await loadFlyers();
        } else {
            throw new Error(data.message || 'Errore nell\'eliminazione');
        }
    } catch (error) {
        console.error('❌ Errore nell\'eliminazione singola:', error);
        showAlert(`Errore nell'eliminazione: ${error.message}`, 'danger');
    } finally {
        showLoading(false);
    }
}

// Visualizza PDF
function viewPDF(flyerId, source) {
    let pdfUrl;
    
    if (source === 'upload') {
        const flyer = allFlyers.find(f => f._id === flyerId);
        if (flyer && flyer.filename) {
            pdfUrl = `/api/pdfs/view/${flyer.filename}`;
        }
    } else {
        pdfUrl = `/api/${source}/pdf/${flyerId}`;
    }
    
    if (pdfUrl) {
        window.open(pdfUrl, '_blank');
    } else {
        showAlert('PDF non disponibile', 'danger');
    }
}

// Mostra alert
function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    
    if (type === 'clear') {
        alertContainer.innerHTML = '';
        return;
    }
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    alertContainer.innerHTML = '';
    alertContainer.appendChild(alertDiv);
    
    // Auto-hide dopo 5 secondi
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Chiudi modal cliccando fuori
window.onclick = function(event) {
    const modal = document.getElementById('deleteModal');
    if (event.target === modal) {
        closeDeleteModal();
    }
};

// Gestione tasti
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeDeleteModal();
    }
});
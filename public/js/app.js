// Global variables
let currentTenantId = '';
let offset = 0;
const limit = 5;
let token = localStorage.getItem("token") ?? null

let tenants = [];

// API Base URL - dynamically determine based on current host
const API_BASE = window.location.protocol + '//' + window.location.host;
const TENANT_HEADER = 'x-tenant-id'
const API_OPTION = {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  }


  // console.log(token)
// check if login , if yes go for index.html else login.html
if(!token){
window.location.href = "login.html"; 
}

function showToast(message, type = "info", duration = 2500) {
    const toast = document.getElementById("toast");
  
    // Remove old type classes
    toast.classList.remove("info", "success", "error");
  
    // Add new type
    toast.classList.add(type);
  
    toast.textContent = message;
    toast.classList.add("show");
  
    // Hide after duration
    setTimeout(() => {
      toast.classList.remove("show");
    }, duration);
  }
  
  
// logout

  // Logout button
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("token"); // clear token
    localStorage.removeItem("user"); // clear user
    window.location.href = "login.html"; // redirect to login
  });


// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    loadTenants();
    loadTenantStats();
});

// Setup all event listeners
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            showTab(tabName);
        });
    });

    // Button event listeners
    // document.getElementById('searchTenantsBtn').addEventListener('click', loadTenants);
    document.getElementById('addTenantBtn').addEventListener('click', showCreateTenantModal);
    document.getElementById('addTransactionBtn').addEventListener('click', showCreateTransactionModal);
    document.getElementById('createRandomTxnBtn').addEventListener('click', createRandomTransaction);
    document.getElementById('refreshTransactionsBtn').addEventListener('click', loadTransactions);
    document.getElementById('loadMoreBtn').addEventListener('click', () => {
        loadTransactions(true);
    });
    

    // Tenant selector change
    document.getElementById('tenantSelector').addEventListener('change', loadTransactions);

    // Request ID search functionality
    document.getElementById('requestIdSearch').addEventListener('input', debounceSearch);
    document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);

    // Modal close buttons
    document.querySelectorAll('.close, [data-modal]').forEach(element => {
        element.addEventListener('click', function() {
            const modalId = this.getAttribute('data-modal');
            closeModal(modalId);
        });
    });

    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });

    // Form submissions
    document.getElementById('createTenantForm').addEventListener('submit', handleCreateTenant);
    document.getElementById('createTransactionForm').addEventListener('submit', handleCreateTransaction);
    document.getElementById('editTenantForm').addEventListener('submit', handleEditTenant);
}

// Tab switching
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
}

// Modal functions
function showCreateTenantModal() {
    document.getElementById('createTenantModal').style.display = 'block';
    document.getElementById('createTenantForm').reset();
}

function showCreateTransactionModal() {
    if (!currentTenantId) {
        showToast('Please select a tenant first', 'info');
        return;
    }
    document.getElementById('createTransactionModal').style.display = 'block';
    document.getElementById('createTransactionForm').reset();
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Load tenant statistics
async function loadTenantStats() {
    try {
        const response = await fetch(`${API_BASE}/api/tenants/stats`,{
            method: 'GET',
            headers: {
                ...API_OPTION.headers
            },
        });
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('totalTenants').textContent = data.data.total;
            document.getElementById('activeTenants').textContent = data.data.active;
            document.getElementById('inactiveTenants').textContent = data.data.inactive;
            document.getElementById('suspendedTenants').textContent = data.data.suspended;
        }
    } catch (error) {
        console.error('Error loading tenant stats:', error);
    }
}

// Load tenants
async function loadTenants() {
    try {
        const searchTerm = document.getElementById('tenantSearch').value;
        const statusFilter = document.getElementById('statusFilter').value;
        
        let url = `${API_BASE}/api/tenants`;
        const params = new URLSearchParams();
        
        if (searchTerm) params.append('search', searchTerm);
        if (statusFilter) params.append('status', statusFilter);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }

        // console.log('Loading tenants from:', url);
        const response = await fetch(url,{
            method:'GET',
            headers:{
                ...API_OPTION.headers
            }
        });
        const data = await response.json();
        
        if (data.success) {
            tenants = data.data;
            // console.log('Loaded tenants:', tenants);
            
            displayTenants(tenants);
            updateTenantSelector(tenants);
        } else {
            showToast('Failed to load tenants', 'error');
        }
    } catch (error) {
        console.error('Error loading tenants:', error);
        showToast('Error loading tenants', 'error');
    }
}

// Refresh tenant list (useful for after creating/updating tenants)
async function refreshTenantList() {
    // Clear search filters
    document.getElementById('tenantSearch').value = '';
    document.getElementById('statusFilter').value = '';
    
    // Reload tenants
    await loadTenants();
}

// Display tenants in table
function displayTenants(tenants) {
    const tableContainer = document.getElementById('tenantsTable');
    
    if (tenants.length === 0) {
        tableContainer.innerHTML = '<div class="loading">No tenants found</div>';
        return;
    }

    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Dialect</th>
                    <th>Database Host</th>
                    <th>Database</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    tenants.forEach(tenant => {
        const statusClass = `status-${tenant.status.toLowerCase()}`;
        tableHTML += `
            <tr>
                <td><strong>${tenant.id}</strong></td>
                <td>${tenant.name}</td>
                <td><span class="dialect-badge">${tenant.dialect || 'mysql'}</span></td>
                <td>${tenant.db_host}:${tenant.db_port}</td>
                <td>${tenant.db_name}</td>
                <td><span class="status-badge ${statusClass}">${tenant.status}</span></td>
                <td>${new Date(tenant.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-info btn-sm test-connection-btn" data-tenant-id="${tenant.id}" title="Test Connection">
                        <i class="fas fa-plug"></i>
                    </button>
                    <button class="btn btn-warning btn-sm edit-tenant-btn" data-tenant-id="${tenant.id}" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm delete-tenant-btn" data-tenant-id="${tenant.id}" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table>';
    tableContainer.innerHTML = tableHTML;

    // Add event listeners to dynamically created buttons
    setupDynamicEventListeners();
}

// Setup event listeners for dynamically created content
function setupDynamicEventListeners() {
    // Test connection buttons
    document.querySelectorAll('.test-connection-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tenantId = this.getAttribute('data-tenant-id');
            testConnection(tenantId);
        });
    });

    // Edit tenant buttons
    document.querySelectorAll('.edit-tenant-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tenantId = this.getAttribute('data-tenant-id');
            editTenant(tenantId);
        });
    });

    // Delete tenant buttons
    document.querySelectorAll('.delete-tenant-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tenantId = this.getAttribute('data-tenant-id');
            deleteTenant(tenantId);
        });
    });
}

// Update tenant selector dropdown
function updateTenantSelector(tenants) {
    const selector = document.getElementById('tenantSelector');
    if (!selector) return;
    
    // Clear existing options
    selector.innerHTML = '<option value="">Choose a tenant...</option>';
    currentTenantId = ''
    
    // Add all active tenants to the dropdown
    tenants.filter(t => t.status === 'ACTIVE').forEach(tenant => {
        const option = document.createElement('option');
        option.value = tenant.id;
        option.textContent = `${tenant.id} - ${tenant.name}`;
        selector.appendChild(option);
    });
    
    // console.log(`Updated tenant selector with ${tenants.filter(t => t.status === 'ACTIVE').length} active tenants`);
}

async function loadTransactions(loadMore = false) {
    const tenantId = document.getElementById('tenantSelector').value;
    const requestId = document.getElementById('requestIdSearch').value.trim();
    currentTenantId = ''
    document.getElementById('loadMoreBtn').style.display = 'none';

    if (!tenantId) {
        document.getElementById('transactionsTable').innerHTML = 
            '<div class="loading">Select a tenant to view transactions</div>';
        return;
    }

    // Reset offset if tenant changed or search changed
    if (currentTenantId !== tenantId || !loadMore) {
        currentTenantId = tenantId;
        offset = 0;
        document.getElementById('transactionsTable').innerHTML = 
            '<div class="loading">Loading...</div>';
    }

    try {
        // Build query parameters
        const queryParams = new URLSearchParams({
            tenant: tenantId,
            offset: offset,
            limit: limit
        });
        
        // Add requestid parameter if provided
        if (requestId) {
            queryParams.append('requestid', requestId);
        }

        const response = await fetch(
            `${API_BASE}/api/prior-auth/txn?${queryParams.toString()}`,
            {
                ...API_OPTION,
                headers: {
                    ...API_OPTION.headers,
                    [TENANT_HEADER]: tenantId
                }
            }
        );

        const data = await response.json();

        if (data.success) {
            displayTransactions(data.data, loadMore);
            if (data.data.length < limit) {
                document.getElementById('loadMoreBtn').style.display = 'none';
            } else {
                document.getElementById('loadMoreBtn').style.display = 'block';
            }
            // console.error(data.data.length, limit)
            offset += limit; // move to next batch
        } else {
            showToast('Failed to load transactions', 'error');
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
        showToast('Error loading transactions', 'error');
    }
}


// Display transactions in table
// function displayTransactions(transactions) {
//     const tableContainer = document.getElementById('transactionsTable');
    
//     if (!transactions || transactions.length === 0) {
//         tableContainer.innerHTML = '<div class="loading">No transactions found for this tenant</div>';
//         return;
//     }

//     let tableHTML = `
//         <table>
//             <thead>
//                 <tr>
//                     <th>Request ID</th>
//                     <th>Version</th>
//                     <th>Type</th>
//                     <th>Request Body</th>
//                     <th>Response Body</th>
//                     <th>Created</th>
//                 </tr>
//             </thead>
//             <tbody>
//     `;

//     transactions.forEach(txn => {
//         const reqBody = txn.reqBody ? (typeof txn.reqBody === 'string' ? txn.reqBody : JSON.stringify(txn.reqBody)) : '';
//         const respBody = txn.respBody ? (typeof txn.respBody === 'string' ? txn.respBody : JSON.stringify(txn.respBody)) : '';
        
//         tableHTML += `
//             <tr>
//                 <td><strong>${txn.requestid}</strong></td>
//                 <td>${txn.version}</td>
//                 <td>${txn.txn_type}</td>
//                 <td><div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${reqBody}">${reqBody}</div></td>
//                 <td><div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${respBody}">${respBody}</div></td>
//                 <td>${txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : 'N/A'}</td>
//             </tr>
//         `;
//     });

//     tableHTML += '</tbody></table>';
//     tableContainer.innerHTML = tableHTML;
// }
function displayTransactions(transactions, append = false) {
    const tableContainer = document.getElementById('transactionsTable');

    if (!transactions || transactions.length === 0) {
        if (!append) {
            tableContainer.innerHTML = '<div class="loading">No transactions found for this tenant</div>';
        }
        return;
    }

    let tableHTML = '';

    // If first load → create full table
    if (!append || !tableContainer.querySelector('table')) {
        tableHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Request ID</th>
                        <th>Version</th>
                        <th>Type</th>
                        <th>Request Body</th>
                        <th>Response Body</th>
                        <th>Created</th>
                    </tr>
                </thead>
                <tbody>
        `;
        transactions.forEach(txn => {
            tableHTML += buildRow(txn);
        });
        tableHTML += '</tbody></table>';
        tableContainer.innerHTML = tableHTML;
    } else {
        // Append new rows
        const tbody = tableContainer.querySelector('tbody');
        transactions.forEach(txn => {
            tbody.insertAdjacentHTML('beforeend', buildRow(txn));
        });
    }
}

function buildRow(txn) {
    const reqBody = txn.reqBody ? (typeof txn.reqBody === 'string' ? txn.reqBody : JSON.stringify(txn.reqBody)) : '';
    const respBody = txn.respBody ? (typeof txn.respBody === 'string' ? txn.respBody : JSON.stringify(txn.respBody)) : '';

    return `
        <tr>
            <td><strong>${txn.requestid}</strong></td>
            <td>${txn.version}</td>
            <td>${txn.txn_type}</td>
            <td><div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${reqBody}">${reqBody}</div></td>
            <td><div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${respBody}">${respBody}</div></td>
            <td>${txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : 'N/A'}</td>
        </tr>
    `;
}


// Edit tenant
function editTenant(tenantId) {
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) return;

    document.getElementById('editTenantId').value = tenant.id;
    document.getElementById('editTenantName').value = tenant.name;
    document.getElementById('editTenantDialect').value = tenant.dialect || 'mysql';
    document.getElementById('editDbHost').value = tenant.db_host;
    document.getElementById('editDbPort').value = tenant.db_port;
    document.getElementById('editDbUser').value = tenant.db_user;
    document.getElementById('editDbPassword').value = tenant.db_password;
    document.getElementById('editDbName').value = tenant.db_name;
    document.getElementById('editTenantStatus').value = tenant.status;
    document.getElementById('editTenantDescription').value = tenant.description || '';

    document.getElementById('editTenantModal').style.display = 'block';
}

// Delete tenant
async function deleteTenant(tenantId) {
    if (!confirm('Are you sure you want to delete this tenant? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/tenants/${tenantId}`, {
            method: 'DELETE',
            headers: {
                ...API_OPTION.headers
            }
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Tenant deleted successfully!', 'success');
            await refreshTenantList();
            loadTenantStats();
        } else {
            showToast(data.message || 'Failed to delete tenant', 'error');
        }
    } catch (error) {
        console.error('Error deleting tenant:', error);
        showToast('Error deleting tenant', 'error');
    }
}

// Test connection
async function testConnection(tenantId) {
    try {
        const response = await fetch(`${API_BASE}/api/tenants/${tenantId}/test-connection`, {
            method: 'POST',
            headers: {
                ...API_OPTION.headers
            }
        });

        const data = await response.json();
        
        if (data.success) {
            if (data.data.success) {
                showToast(`Connection test successful for ${tenantId}!`, 'success');
            } else {
                showToast(`Connection test failed for ${tenantId}: ${data.data.error}`, 'error');
            }
        } else {
            showToast(data.message || 'Failed to test connection', 'error');
        }
    } catch (error) {
        console.error('Error testing connection:', error);
        showToast('Error testing connection', 'error');
    }
}

// Create random transaction
async function createRandomTransaction() {
    if (!currentTenantId) {
        showToast('Please select a tenant first', 'info');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/prior-auth/txn/random`, {
            method: 'POST',
            headers: {
                ...API_OPTION.headers,
                [TENANT_HEADER]: currentTenantId
            },
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Random transaction created successfully!', 'success');
            loadTransactions();
        } else {
            showToast(data.message || 'Failed to create random transaction', 'error');
        }
    } catch (error) {
        console.error('Error creating random transaction:', error);
        showToast('Error creating random transaction', 'error');
    }
}


// Form handlers
async function handleCreateTenant(e) {
    e.preventDefault();
    
    const formData = {
        id: document.getElementById('tenantId').value,
        name: document.getElementById('tenantName').value,
        dialect: document.getElementById('tenantDialect').value,
        db_host: document.getElementById('dbHost').value,
        db_port: parseInt(document.getElementById('dbPort').value),
        db_user: document.getElementById('dbUser').value,
        db_password: document.getElementById('dbPassword').value,
        db_name: document.getElementById('dbName').value,
        status: document.getElementById('tenantStatus').value,
        description: document.getElementById('tenantDescription').value
    };

    try {
        const response = await fetch(`${API_BASE}/api/tenants`, {
            method: 'POST',
            headers: {
                ...API_OPTION.headers
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Tenant created successfully!', 'success');
            closeModal('createTenantModal');
            await refreshTenantList();
            loadTenantStats();
        } else {
            showToast(data.message || 'Failed to create tenant', 'error');
        }
    } catch (error) {
        console.error('Error creating tenant:', error);
        showToast('Error creating tenant', 'error');
    }
}

async function handleCreateTransaction(e) {
    e.preventDefault();
    
    const formData = {
        requestid: document.getElementById('txnRequestId').value,
        version: parseInt(document.getElementById('txnVersion').value),
        txn_type: parseInt(document.getElementById('txnType').value),
        reqBody: document.getElementById('txnReqBody').value,
        respBody: document.getElementById('txnRespBody').value
    };

    try {
        const response = await fetch(`${API_BASE}/api/prior-auth/txn`, {
            method: 'POST',
            headers: {
                ...API_OPTION.headers,
                [TENANT_HEADER]: currentTenantId
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Transaction created successfully!', 'success');
            closeModal('createTransactionModal');
            loadTransactions();
        } else {
            showToast(data.message || 'Failed to create transaction', 'error');
        }
    } catch (error) {
        console.error('Error creating transaction:', error);
        showToast('Error creating transaction', 'error');
    }
}

async function handleEditTenant(e) {
    e.preventDefault();
    
    const tenantId = document.getElementById('editTenantId').value;
    const formData = {
        name: document.getElementById('editTenantName').value,
        dialect: document.getElementById('editTenantDialect').value,
        db_host: document.getElementById('editDbHost').value,
        db_port: parseInt(document.getElementById('editDbPort').value),
        db_user: document.getElementById('editDbUser').value,
        db_password: document.getElementById('editDbPassword').value,
        db_name: document.getElementById('editDbName').value,
        status: document.getElementById('editTenantStatus').value,
        description: document.getElementById('editTenantDescription').value
    };

    try {
        const response = await fetch(`${API_BASE}/api/tenants/${tenantId}`, {
            method: 'PUT',
            headers: {
                ...API_OPTION.headers,
                [TENANT_HEADER]: tenantId
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Tenant updated successfully!', 'success');
            closeModal('editTenantModal');
            await refreshTenantList();
            loadTenantStats();
        } else {
            showToast(data.message || 'Failed to update tenant', 'error');
        }
    } catch (error) {
        console.error('Error updating tenant:', error);
        showToast('Error updating tenant', 'error');
    }
}


/* tenant-search.js
   Minimal, self-contained debounce + toast hint when query < MIN_QUERY_LENGTH.
*/
(function () {
    // CONFIG
    const MIN_QUERY_LENGTH = 3;
    const DEBOUNCE_MS = 350;
  
    // Simple debounce that exposes .cancel()
    function debounce(fn, wait = 350) {
      let timer = null;
      const debounced = function (...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          fn.apply(this, args);
        }, wait);
      };
      debounced.cancel = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };
      return debounced;
    }
  
    // DOM ready
    document.addEventListener('DOMContentLoaded', () => {
      const tenantInput = document.getElementById('tenantSearch');
      const statusSelect = document.getElementById('statusFilter');
  
      if (!tenantInput || !statusSelect) {
        console.warn('tenant-search.js: Required elements not found (tenantSearch, statusFilter, searchTenantsBtn).');
        return;
      }
  
      // Debounced logic (decides when to call searchTenants)
      const debouncedSearch = debounce(() => {
        const q = tenantInput.value.trim();
        const status = statusSelect.value;
  
        // If user typed a short query, show a toast hint and don't search
        if (q && q.length < MIN_QUERY_LENGTH) {
          showToast(`Type at least ${MIN_QUERY_LENGTH} characters to search.`, 'error', 1800);
          return;
        }
  
        // else run search
        // searchTenants({ query: q, status });
        loadTenants()
      }, DEBOUNCE_MS);
  
      // input handler
      tenantInput.addEventListener('input', () => {
        debouncedSearch();
      });
  
      // status change handler
      statusSelect.addEventListener('change', () => {
        debouncedSearch();
      });
  
      // enter key triggers immediate search
      tenantInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          debouncedSearch.cancel();
          const q = tenantInput.value.trim();
          const status = statusSelect.value;
          if (q && q.length < MIN_QUERY_LENGTH) {
            showToast(`Type at least ${MIN_QUERY_LENGTH} characters to search.`, 'error', 1800);
            return;
          }
          loadTenants()
        }
      });
  
      // expose for convenience
      window.triggerTenantSearch = function () {
        debouncedSearch.cancel();
        const q = tenantInput.value.trim();
        const status = statusSelect.value;
        if (q && q.length < MIN_QUERY_LENGTH) {
          showToast(`Type at least ${MIN_QUERY_LENGTH} characters to search.`, 'error', 1800);
          return;
        }
        searchTenants({ query: q, status });
      };
  
      window.cancelPendingTenantSearch = function () {
        debouncedSearch.cancel();
      };
    });
  })();

// Request ID search functionality
let searchTimeout;

function debounceSearch() {
    const searchInput = document.getElementById('requestIdSearch');
    const clearBtn = document.getElementById('clearSearchBtn');
    
    // Show/hide clear button based on input
    if (searchInput.value.trim()) {
        clearBtn.style.display = 'block';
    } else {
        clearBtn.style.display = 'none';
    }
    
    // Clear existing timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // Set new timeout for search
    searchTimeout = setTimeout(() => {
        loadTransactions();
    }, 300); // 300ms debounce
}

function clearSearch() {
    const searchInput = document.getElementById('requestIdSearch');
    const clearBtn = document.getElementById('clearSearchBtn');
    
    searchInput.value = '';
    clearBtn.style.display = 'none';
    
    // Clear any pending search
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // Reload transactions without search
    loadTransactions();
}
  
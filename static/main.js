async function fetchBoard() {
  const res = await fetch('/api/board');
  if (!res.ok) throw new Error('Failed to load board');
  return await res.json();
}

let socket;
let users = [];

async function fetchUsers() {
  const res = await fetch('/api/users');
  if (!res.ok) throw new Error('Failed to load users');
  return await res.json();
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.substring(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  });
  for (const child of children) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function renderCard(card) {
  const article = document.getElementById('card-template').content.firstElementChild.cloneNode(true);
  article.id = card.id;
  article.querySelector('.card-title').textContent = card.title;
  article.querySelector('.card-desc').textContent = card.description || '';
  const dueEl = article.querySelector('.card-due');
  if (dueEl) {
    const meta = article.querySelector('.card-meta');
    if (card.due_date) {
      dueEl.textContent = card.due_date;
      if (meta) meta.style.display = '';
    } else {
      dueEl.textContent = '';
      if (meta) meta.style.display = 'none';
    }
  }
  const assigneeEl = article.querySelector('.card-assignee');
  if (assigneeEl) {
    if (card.assignee) {
      assigneeEl.textContent = card.assignee;
      const meta = article.querySelector('.card-meta');
      if (meta) meta.style.display = '';
    } else {
      assigneeEl.textContent = '';
    }
  }
  const subtasksUl = article.querySelector('.subtasks');
  if (subtasksUl && Array.isArray(card.subtasks)) {
    subtasksUl.innerHTML = '';
    card.subtasks.forEach((st) => {
      const li = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!st.done;
      cb.addEventListener('change', async () => {
        await fetch(`/api/cards/${card.id}/subtasks/${st.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ done: cb.checked })
        });
      });
      const span = document.createElement('span');
      span.textContent = st.text;
      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        const resp = await fetch(`/api/cards/${card.id}/subtasks/${st.id}`, { method: 'DELETE' });
        if (resp.ok) {
          li.remove();
        }
      });
      li.appendChild(cb);
      li.appendChild(span);
      li.appendChild(remove);
      subtasksUl.appendChild(li);
    });
  }

  article.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', card.id);
    e.dataTransfer.effectAllowed = 'move';
  });

  // Inline edit on double-click
  article.addEventListener('dblclick', () => enterEditMode(article, card));
  return article;
}

async function updateCard(cardId, updates) {
  const res = await fetch(`/api/cards/${cardId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error('Failed to update card');
  return await res.json();
}

function enterEditMode(article, card) {
  if (article.classList.contains('editing')) return;
  article.classList.add('editing');
  article.setAttribute('draggable', 'false');

  const titleView = article.querySelector('.card-title');
  const descView = article.querySelector('.card-desc');
  const originalTitle = titleView.textContent;
  const originalDesc = descView.textContent;
  const dueView = article.querySelector('.card-due');
  const originalDue = card.due_date || '';
  const metaContainer = article.querySelector('.card-meta');
  if (metaContainer) metaContainer.style.display = '';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'edit-title';
  titleInput.value = originalTitle;
  titleInput.placeholder = 'Title';

  const descInput = document.createElement('textarea');
  descInput.className = 'edit-desc';
  descInput.value = originalDesc;
  descInput.placeholder = 'Description';
  descInput.rows = 3;

  const dueInput = document.createElement('input');
  dueInput.type = 'date';
  dueInput.className = 'edit-due';
  if (originalDue) dueInput.value = originalDue;

  const assigneeInput = document.createElement('select');
  assigneeInput.className = 'edit-assignee';
  
  // Add empty option
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = 'Select assignee...';
  assigneeInput.appendChild(emptyOption);
  
  // Add user options
  users.forEach(user => {
    const option = document.createElement('option');
    option.value = user.name;
    option.textContent = user.name;
    if (card.assignee === user.name) {
      option.selected = true;
    }
    assigneeInput.appendChild(option);
  });

  const subtaskInput = document.createElement('input');
  subtaskInput.type = 'text';
  subtaskInput.placeholder = 'Add subtask and press Enter';
  subtaskInput.className = 'edit-subtask';
  subtaskInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = subtaskInput.value.trim();
      if (!text) return;
      await fetch(`/api/cards/${card.id}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      subtaskInput.value = '';
    }
  });

  const actions = document.createElement('div');
  actions.className = 'edit-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);

  titleView.replaceWith(titleInput);
  descView.replaceWith(descInput);
  
  // Replace the meta container with edit grid
  if (metaContainer) {
    const grid = document.createElement('div');
    grid.className = 'edit-grid';
    grid.appendChild(dueInput);
    grid.appendChild(assigneeInput);
    metaContainer.replaceWith(grid);
  }
  
  const subtasksList = article.querySelector('.subtasks');
  if (subtasksList) article.insertBefore(subtaskInput, subtasksList);
  article.appendChild(actions);

  const exitEdit = () => {
    // Restore view mode
    const newTitleEl = document.createElement('h3');
    newTitleEl.className = 'card-title';
    newTitleEl.textContent = card.title;
    const newDescEl = document.createElement('p');
    newDescEl.className = 'card-desc';
    newDescEl.textContent = card.description || '';

    titleInput.replaceWith(newTitleEl);
    descInput.replaceWith(newDescEl);
    actions.remove();
    article.classList.remove('editing');
    article.setAttribute('draggable', 'true');
  };

  const save = async () => {
    const nextTitle = titleInput.value.trim();
    const nextDesc = descInput.value.trim();
    const nextDue = dueInput.value || null;
    const nextAssignee = assigneeInput.value.trim() || null;
    if (!nextTitle) {
      titleInput.focus();
      return;
    }
    try {
      const updated = await updateCard(card.id, { title: nextTitle, description: nextDesc, dueDate: nextDue, assignee: nextAssignee });
      card.title = updated.title;
      card.description = updated.description;
      card.due_date = updated.due_date;
      card.assignee = updated.assignee;
      // Re-render entire board to respect sorting and due visibility
      init();
    } catch (e) {
      console.error(e);
    }
  };

  const cancel = () => {
    // Revert any changes and restore original values
    card.title = originalTitle;
    card.description = originalDesc;
    card.due_date = originalDue || null;
    exitEdit();
    // Refresh to restore due visibility accurately
    init();
  };

  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', cancel);
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  descInput.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });

  // Focus the title immediately
  titleInput.focus();
}

function renderBoard(data) {
  for (const col of ['todo', 'in_progress', 'done']) {
    const container = document.getElementById(col);
    container.innerHTML = '';
    (data[col] || []).forEach((c) => container.appendChild(renderCard(c)));
    // Inject ghost card only for To-Do column at the bottom
    if (col === 'todo') {
      const ghost = document.createElement('article');
      ghost.className = 'ghost-card';
      ghost.textContent = '+ Add new card';
      ghost.addEventListener('click', openNewCardModal);
      container.appendChild(ghost);
    }
  }
}

async function moveCard(cardId, toColumn, position) {
  const res = await fetch(`/api/cards/${cardId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toColumn, position })
  });
  if (!res.ok) throw new Error('Failed to move card');
  return await res.json();
}

function setupDnD() {
  document.querySelectorAll('.column').forEach((col) => {
    const dropZone = col.querySelector('.cards');

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'move';
    });

    dropZone.addEventListener('dragleave', () => {
      col.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const cardId = e.dataTransfer.getData('text/plain');
      const toColumn = col.dataset.column;

      // Compute position by finding index relative to children
      const children = Array.from(dropZone.querySelectorAll('.card'));
      let position = children.length;
      const afterElement = getDragAfterElement(dropZone, e.clientY);
      if (afterElement == null) position = children.length;
      else position = children.indexOf(afterElement);

      try {
        await moveCard(cardId, toColumn, position);
        // After moving, refresh data to apply due-date sorting in destination
        init();
      } catch (err) {
        console.error(err);
        // Fallback: reload board
        init();
      }
    });
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.card:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function openNewCardModal() {
  const overlay = document.getElementById('new-card-modal');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.getElementById('modal-title').focus();
}

function closeNewCardModal() {
  const overlay = document.getElementById('new-card-modal');
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.getElementById('modal-new-card-form').reset();
}

function setupNewCardModal() {
  const overlay = document.getElementById('new-card-modal');
  const form = document.getElementById('modal-new-card-form');
  const cancelBtn = document.getElementById('modal-cancel');
  cancelBtn.addEventListener('click', closeNewCardModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeNewCardModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeNewCardModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      title: fd.get('title'),
      description: fd.get('description'),
      column: fd.get('column'),
      dueDate: fd.get('dueDate') || null
    };
    const res = await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      closeNewCardModal();
      init();
    }
  });
}

async function init() {
  try {
    // Load users first
    users = await fetchUsers();
    
    const data = await fetchBoard();
    renderBoard(data);
  } catch (e) {
    console.error(e);
  }

  if (!socket && window.io) {
    socket = io();
    socket.on('board_changed', (payload) => {
      renderBoard(payload);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupDnD();
  setupNewCardModal();
  init();
});



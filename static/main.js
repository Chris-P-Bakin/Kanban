async function fetchBoard() {
  const res = await fetch('/api/board');
  if (!res.ok) throw new Error('Failed to load board');
  return await res.json();
}

let socket;
let users = [];
let tags = [];
let selectedFilterTags = [];

async function fetchUsers() {
  const res = await fetch('/api/users');
  if (!res.ok) throw new Error('Failed to load users');
  return await res.json();
}

async function fetchTags() {
  const res = await fetch('/api/tags');
  if (!res.ok) throw new Error('Failed to load tags');
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
  article.setAttribute('data-card-id', card.id);
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
  const cardTagsDiv = article.querySelector('.card-tags');
  if (cardTagsDiv && Array.isArray(card.tags)) {
    cardTagsDiv.innerHTML = '';
    card.tags.forEach((tag) => {
      const tagEl = document.createElement('span');
      tagEl.className = 'tag';
      tagEl.textContent = tag.name;
      tagEl.style.backgroundColor = tag.color;
      cardTagsDiv.appendChild(tagEl);
    });
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

async function archiveCard(cardId) {
  const res = await fetch(`/api/cards/${cardId}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error('Failed to archive card');
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

  const timeInput = document.createElement('input');
  timeInput.type = 'number';
  timeInput.className = 'edit-time';
  timeInput.placeholder = 'Time in minutes';
  timeInput.min = '1';
  if (card.estimated_time) timeInput.value = card.estimated_time;

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

  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.className = 'edit-tags';
  tagInput.placeholder = 'Type tag names (comma separated)';
  
  // Set current tags as comma-separated string
  if (card.tags && card.tags.length > 0) {
    tagInput.value = card.tags.map(tag => tag.name).join(', ');
  }
  
  // Create autocomplete dropdown
  const autocompleteContainer = document.createElement('div');
  autocompleteContainer.className = 'autocomplete-container';
  autocompleteContainer.style.position = 'relative';
  
  const autocompleteList = document.createElement('div');
  autocompleteList.className = 'autocomplete-list';
  autocompleteList.style.display = 'none';
  
  autocompleteContainer.appendChild(tagInput);
  autocompleteContainer.appendChild(autocompleteList);
  
  // Autocomplete functionality
  tagInput.addEventListener('input', (e) => {
    const originalValue = e.target.value;
    const value = originalValue.toLowerCase();
    const currentTags = originalValue.split(',').map(t => t.trim()).filter(t => t);
    const lastTag = currentTags[currentTags.length - 1] || '';
    
    if (lastTag.length > 0) {
      const matches = tags.filter(tag => 
        tag.name.toLowerCase().includes(lastTag.toLowerCase()) && 
        !currentTags.map(t => t.toLowerCase()).includes(tag.name.toLowerCase())
      );
      
      if (matches.length > 0) {
        autocompleteList.innerHTML = '';
        matches.forEach(tag => {
          const item = document.createElement('div');
          item.className = 'autocomplete-item';
          item.textContent = tag.name;
          item.style.backgroundColor = tag.color;
          item.style.color = 'white';
          item.addEventListener('click', () => {
            const beforeLast = currentTags.slice(0, -1).join(', ');
            const newValue = beforeLast + (beforeLast ? ', ' : '') + tag.name + ', ';
            tagInput.value = newValue;
            autocompleteList.style.display = 'none';
            tagInput.focus();
          });
          autocompleteList.appendChild(item);
        });
        autocompleteList.style.display = 'block';
      } else {
        autocompleteList.style.display = 'none';
      }
    } else {
      autocompleteList.style.display = 'none';
    }
  });
  
  // Hide autocomplete when clicking outside
  document.addEventListener('click', (e) => {
    if (!autocompleteContainer.contains(e.target)) {
      autocompleteList.style.display = 'none';
    }
  });
  
  // Handle keyboard navigation for autocomplete
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (autocompleteList.style.display !== 'none') {
        const firstOption = autocompleteList.querySelector('.autocomplete-item');
        if (firstOption) {
          firstOption.click();
        }
      }
    }
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
    grid.appendChild(timeInput);
    grid.appendChild(assigneeInput);
    metaContainer.replaceWith(grid);
  }
  
  const subtasksList = article.querySelector('.subtasks');
  if (subtasksList) {
    article.insertBefore(autocompleteContainer, subtasksList);
    article.insertBefore(subtaskInput, subtasksList);
  }
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
    const nextTime = timeInput.value ? parseInt(timeInput.value) : null;
    const nextAssignee = assigneeInput.value.trim() || null;
    
    // Parse tag names from comma-separated string
    const tagNames = tagInput.value.split(',').map(t => t.trim()).filter(t => t);
    const selectedTagIds = tagNames.map(tagName => {
      const tag = tags.find(t => t.name === tagName);
      return tag ? tag.id : null;
    }).filter(id => id !== null);
    
    if (!nextTitle) {
      titleInput.focus();
      return;
    }
    try {
      const updated = await updateCard(card.id, { 
        title: nextTitle, 
        description: nextDesc, 
        dueDate: nextDue, 
        estimatedTime: nextTime,
        assignee: nextAssignee,
        tagIds: selectedTagIds
      });
      card.title = updated.title;
      card.description = updated.description;
      card.due_date = updated.due_date;
      card.estimated_time = updated.estimated_time;
      card.assignee = updated.assignee;
      card.tags = updated.tags;
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
  
  // Add global drop handler to detect when cards are dropped outside any column
  document.addEventListener('drop', async (e) => {
    // Hide archive drop zone
    const archiveZone = document.getElementById('archive-drop-zone');
    if (archiveZone) {
      archiveZone.classList.remove('active');
    }
    
    // Only handle if the drop is not on a column
    if (!e.target.closest('.column')) {
      const cardId = e.dataTransfer.getData('text/plain');
      if (cardId) {
        e.preventDefault();
        try {
          await archiveCard(cardId);
          // Remove the card from the DOM immediately
          const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
          if (cardElement) {
            cardElement.remove();
          }
        } catch (err) {
          console.error('Failed to archive card:', err);
        }
      }
    }
  });
  
  // Show archive drop zone when dragging over non-column areas
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    
    // Show archive zone if dragging over non-column areas
    if (!e.target.closest('.column')) {
      const archiveZone = document.getElementById('archive-drop-zone');
      if (archiveZone) {
        archiveZone.classList.add('active');
      }
    }
  });
  
  // Hide archive drop zone when leaving the document
  document.addEventListener('dragleave', (e) => {
    if (e.target === document.body || e.target === document.documentElement) {
      const archiveZone = document.getElementById('archive-drop-zone');
      if (archiveZone) {
        archiveZone.classList.remove('active');
      }
    }
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
      dueDate: fd.get('dueDate') || null,
      estimatedTime: fd.get('estimatedTime') ? parseInt(fd.get('estimatedTime')) : null
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
    // Load users and tags first
    users = await fetchUsers();
    tags = await fetchTags();
    
            // Initialize multi-tag filter
            setupMultiTagFilter();
    
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
    socket.on('tags_changed', () => {
      // Refresh tags and filter dropdown
      fetchTags().then((newTags) => {
        tags = newTags; // Update global tags array
        // Refresh multi-tag filter
        setupMultiTagFilter();
        // Re-render the board to show updated tags on cards
        init();
      });
    });
  }
}

function setupMultiTagFilter() {
  const tagFilterInput = document.getElementById('tag-filter-input');
  const tagFilterDropdown = document.getElementById('tag-filter-dropdown');
  const selectedTagsContainer = document.getElementById('selected-tags');
  const clearFilter = document.getElementById('clear-filter');
  
  if (tagFilterInput) {
    tagFilterInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      if (query.length > 0) {
        const filteredTags = tags.filter(tag => 
          tag.name.toLowerCase().includes(query) && 
          !selectedFilterTags.some(selected => selected.id === tag.id)
        );
        showTagDropdown(filteredTags);
      } else {
        hideTagDropdown();
      }
    });
    
    // Hide dropdown on escape key
    tagFilterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideTagDropdown();
        tagFilterInput.blur();
      }
    });
    
    tagFilterInput.addEventListener('focus', () => {
      if (tagFilterInput.value.length > 0) {
        const query = tagFilterInput.value.toLowerCase();
        const filteredTags = tags.filter(tag => 
          tag.name.toLowerCase().includes(query) && 
          !selectedFilterTags.some(selected => selected.id === tag.id)
        );
        showTagDropdown(filteredTags);
      }
    });
    
    tagFilterInput.addEventListener('blur', (e) => {
      // Delay hiding to allow clicks on dropdown items
      setTimeout(() => {
        // Only hide if focus didn't move to dropdown
        const dropdown = document.getElementById('tag-filter-dropdown');
        if (dropdown && !dropdown.contains(document.activeElement)) {
          hideTagDropdown();
        }
      }, 150);
    });
  }
  
  if (clearFilter) {
    clearFilter.addEventListener('click', () => {
      selectedFilterTags = [];
      updateSelectedTagsDisplay();
      filterCardsByTags();
      tagFilterInput.value = '';
      hideTagDropdown();
    });
  }
  
  // Hide dropdown when clicking outside (only add once)
  if (!window.tagFilterClickHandlerAdded) {
    document.addEventListener('click', (e) => {
      const tagFilterContainer = document.querySelector('.tag-filter-container');
      const dropdown = document.getElementById('tag-filter-dropdown');
      
      // Hide if clicking outside the container and not on the dropdown
      if (tagFilterContainer && !tagFilterContainer.contains(e.target) && 
          dropdown && !dropdown.contains(e.target)) {
        hideTagDropdown();
      }
    });
    
    // Also add a more aggressive handler
    document.body.addEventListener('click', (e) => {
      const dropdown = document.getElementById('tag-filter-dropdown');
      if (dropdown && !dropdown.classList.contains('hidden')) {
        const tagFilterContainer = document.querySelector('.tag-filter-container');
        if (!tagFilterContainer.contains(e.target)) {
          hideTagDropdown();
        }
      }
    });
    
    window.tagFilterClickHandlerAdded = true;
  }
}

function showTagDropdown(filteredTags) {
  const dropdown = document.getElementById('tag-filter-dropdown');
  if (!dropdown) return;
  
  dropdown.innerHTML = '';
  dropdown.classList.remove('hidden');
  dropdown.style.display = 'block';
  dropdown.style.visibility = 'visible';
  
  if (filteredTags.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'tag-filter-option';
    noResults.textContent = 'No matching tags';
    noResults.style.color = '#666';
    noResults.style.cursor = 'default';
    dropdown.appendChild(noResults);
    return;
  }
  
  filteredTags.forEach(tag => {
    const option = document.createElement('div');
    option.className = 'tag-filter-option';
    option.innerHTML = `
      <span class="tag-chip" style="background-color: ${tag.color}">${tag.name}</span>
      <span>${tag.name}</span>
    `;
    option.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent blur on input
    });
    
    option.addEventListener('click', () => {
      addTagToFilter(tag);
      document.getElementById('tag-filter-input').value = '';
      hideTagDropdown();
    });
    dropdown.appendChild(option);
  });
}

function hideTagDropdown() {
  const dropdown = document.getElementById('tag-filter-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
    dropdown.style.display = 'none';
    dropdown.style.visibility = 'hidden';
  }
}

function addTagToFilter(tag) {
  if (!selectedFilterTags.some(selected => selected.id === tag.id)) {
    selectedFilterTags.push(tag);
    updateSelectedTagsDisplay();
    filterCardsByTags();
  }
}

function removeTagFromFilter(tagId) {
  selectedFilterTags = selectedFilterTags.filter(tag => tag.id !== tagId);
  updateSelectedTagsDisplay();
  filterCardsByTags();
}

function updateSelectedTagsDisplay() {
  const container = document.getElementById('selected-tags');
  if (!container) return;
  
  container.innerHTML = '';
  
  selectedFilterTags.forEach(tag => {
    const tagElement = document.createElement('div');
    tagElement.className = 'selected-tag';
    tagElement.innerHTML = `
      <span class="tag-chip" style="background-color: ${tag.color}">${tag.name}</span>
      <span class="remove-tag" data-tag-id="${tag.id}">×</span>
    `;
    
    tagElement.querySelector('.remove-tag').addEventListener('click', (e) => {
      e.stopPropagation();
      removeTagFromFilter(tag.id);
    });
    
    container.appendChild(tagElement);
  });
}

function filterCardsByTags() {
  const allCards = document.querySelectorAll('.card');
  allCards.forEach(card => {
    if (selectedFilterTags.length === 0) {
      // Show all cards
      card.style.display = '';
    } else {
      // Check if card has any of the selected tags
      const cardTags = card.querySelectorAll('.tag');
      let hasAnyTag = false;
      
      cardTags.forEach(tagEl => {
        const tagName = tagEl.textContent;
        const hasTag = selectedFilterTags.some(selectedTag => selectedTag.name === tagName);
        if (hasTag) {
          hasAnyTag = true;
        }
      });
      
      card.style.display = hasAnyTag ? '' : 'none';
    }
  });
}

function setupTagManagement() {
  const tagModal = document.getElementById('tag-management-modal');
  const tagModalClose = document.getElementById('tag-modal-close');
  const addTagForm = document.getElementById('add-tag-form');
  
  // Close modal
  if (tagModalClose) {
    tagModalClose.addEventListener('click', () => {
      tagModal.classList.add('hidden');
      tagModal.setAttribute('aria-hidden', 'true');
    });
  }
  
  // Close on backdrop click
  if (tagModal) {
    tagModal.addEventListener('click', (e) => {
      if (e.target === tagModal) {
        tagModal.classList.add('hidden');
        tagModal.setAttribute('aria-hidden', 'true');
      }
    });
  }
  
  // Add new tag
  if (addTagForm) {
    addTagForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-tag-name').value.trim();
      const colorInput = document.querySelector('input[name="tag-color"]:checked');
      const color = colorInput ? colorInput.value : '#93c5fd';
      
      if (!name) return;
      
      try {
        await fetch('/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color })
        });
        
        // Refresh tags and close form
        await loadTags();
        tags = await fetchTags(); // Also update the global tags array for autocomplete
        addTagForm.reset();
        // Reset color picker to first option
        document.getElementById('color-1').checked = true;
      } catch (err) {
        console.error('Failed to create tag:', err);
        alert('Failed to create tag. It may already exist.');
      }
    });
  }
  
  // Keyboard shortcut: Ctrl+T
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      openTagManagement();
    }
  });
}

function openTagManagement() {
  const tagModal = document.getElementById('tag-management-modal');
  tagModal.classList.remove('hidden');
  tagModal.setAttribute('aria-hidden', 'false');
  loadTags();
  document.getElementById('new-tag-name').focus();
}

async function loadTags() {
  try {
    const response = await fetch('/api/tags');
    const tagsData = await response.json();
    renderTagsList(tagsData);
  } catch (err) {
    console.error('Failed to load tags:', err);
  }
}

function renderTagsList(tagsData) {
  const tagsList = document.getElementById('tags-list');
  if (!tagsList) return;
  
  tagsList.innerHTML = '';
  
  tagsData.forEach(tag => {
    const tagItem = document.createElement('div');
    tagItem.className = 'tag-item';
    tagItem.innerHTML = `
      <div class="tag-preview">
        <span class="tag-chip" style="background-color: ${tag.color}">${tag.name}</span>
      </div>
      <div class="tag-actions">
        <button class="btn btn-ghost edit-tag-btn" data-tag-id="${tag.id}">Edit</button>
        <button class="btn btn-ghost delete-tag-btn" data-tag-id="${tag.id}">Delete</button>
      </div>
    `;
    
    tagsList.appendChild(tagItem);
  });
  
  // Add event listeners
  tagsList.querySelectorAll('.edit-tag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tagId = e.target.dataset.tagId;
      const tag = tagsData.find(t => t.id === tagId);
      if (tag) editTag(tag);
    });
  });
  
  tagsList.querySelectorAll('.delete-tag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tagId = e.target.dataset.tagId;
      const tag = tagsData.find(t => t.id === tagId);
      if (tag) deleteTag(tag);
    });
  });
}

function editTag(tag) {
  const tagItem = document.querySelector(`[data-tag-id="${tag.id}"]`).closest('.tag-item');
  const tagPreview = tagItem.querySelector('.tag-preview');
  const tagActions = tagItem.querySelector('.tag-actions');
  
  const editForm = document.createElement('div');
  editForm.className = 'tag-edit-form';
  
  // Create color options for editing
  const colorOptions = [
    { id: 'edit-color-1', value: '#93c5fd', name: 'Soft Blue' },
    { id: 'edit-color-2', value: '#fca5a5', name: 'Soft Pink' },
    { id: 'edit-color-3', value: '#86efac', name: 'Soft Green' },
    { id: 'edit-color-4', value: '#fde68a', name: 'Soft Yellow' },
    { id: 'edit-color-5', value: '#c4b5fd', name: 'Soft Purple' },
    { id: 'edit-color-6', value: '#f9a8d4', name: 'Soft Rose' },
    { id: 'edit-color-7', value: '#a7f3d0', name: 'Soft Mint' },
    { id: 'edit-color-8', value: '#fbbf24', name: 'Soft Orange' }
  ];
  
  const selectedColor = colorOptions.find(c => c.value === tag.color) || colorOptions[0];
  
  editForm.innerHTML = `
    <input type="text" value="${tag.name}" class="edit-name">
    <div class="color-picker">
      <div class="color-options">
        ${colorOptions.map(c => `
          <input type="radio" name="edit-tag-color" id="${c.id}" value="${c.value}" ${c.value === tag.color ? 'checked' : ''}>
          <label for="${c.id}" class="color-swatch" style="background-color: ${c.value};"></label>
        `).join('')}
      </div>
    </div>
    <button class="btn btn-primary save-edit">Save</button>
    <button class="btn btn-ghost cancel-edit">Cancel</button>
  `;
  
  tagPreview.style.display = 'none';
  tagActions.style.display = 'none';
  tagItem.appendChild(editForm);
  
  // Event listeners
  editForm.querySelector('.save-edit').addEventListener('click', async () => {
    const newName = editForm.querySelector('.edit-name').value.trim();
    const colorInput = editForm.querySelector('input[name="edit-tag-color"]:checked');
    const newColor = colorInput ? colorInput.value : '#93c5fd';
    
    if (!newName) return;
    
    try {
      await fetch(`/api/tags/${tag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, color: newColor })
      });
      
      await loadTags();
      tags = await fetchTags(); // Also update the global tags array for autocomplete
    } catch (err) {
      console.error('Failed to update tag:', err);
      alert('Failed to update tag. Name may already exist.');
    }
  });
  
  editForm.querySelector('.cancel-edit').addEventListener('click', () => {
    tagPreview.style.display = 'flex';
    tagActions.style.display = 'flex';
    editForm.remove();
  });
}

async function deleteTag(tag) {
  if (!confirm(`Are you sure you want to delete the "${tag.name}" tag? This will remove it from all cards.`)) {
    return;
  }
  
  try {
    await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' });
    await loadTags();
    tags = await fetchTags(); // Also update the global tags array for autocomplete
  } catch (err) {
    console.error('Failed to delete tag:', err);
    alert('Failed to delete tag.');
  }
}

function setupThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.querySelector('.theme-icon');
  
  // Load saved theme or default to light
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
  
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeIcon(newTheme);
    });
  }
}

function updateThemeIcon(theme) {
  const themeIcon = document.querySelector('.theme-icon');
  if (themeIcon) {
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}


document.addEventListener('DOMContentLoaded', () => {
  // Force hide any stuck dropdowns
  hideTagDropdown();
  
  setupDnD();
  setupNewCardModal();
  setupTagManagement();
  setupThemeToggle();
  init();
});




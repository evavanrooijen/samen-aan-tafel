import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAn8lVMwlR7jYIS33ab6dPBCXliMEzVWMo",
  authDomain: "kielastraat-27.firebaseapp.com",
  projectId: "kielastraat-27",
  storageBucket: "kielastraat-27.firebasestorage.app",
  messagingSenderId: "852939999825",
  appId: "1:852939999825:web:b9c8fc4703fdc1b0fdc670",
  measurementId: "G-12N1DVSBRY"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
let currentUser = null;
let householdId = null;
let isRegisterMode = false;
let inventory = [];
let recipes = [];
let shopping = [];
let hideCheckedShopping = false;
let todayData = { name: "", ingredients: [] };
let isEditingTodayMeal = false;
let unsubscribeFns = [];
let toastTimer;

// Vandaag datumsleutel (YYYY-MM-DD)
const dateNow = new Date();
const todayKey = `${dateNow.getFullYear()}-${String(dateNow.getMonth()+1).padStart(2,"0")}-${String(dateNow.getDate()).padStart(2,"0")}`;

function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2400);
}
function showMessage(message) { $("auth-message").textContent = message; }
function friendlyError(error) {
  const messages = {
    "auth/invalid-credential": "E-mailadres of wachtwoord klopt niet.",
    "auth/email-already-in-use": "Voor dit e-mailadres bestaat al een account.",
    "auth/weak-password": "Kies een sterker wachtwoord van minstens 6 tekens.",
    "auth/invalid-email": "Vul een geldig e-mailadres in.",
    "auth/too-many-requests": "Te veel pogingen. Probeer het later opnieuw.",
    "permission-denied": "Geen toegang tot deze gedeelde gegevens."
  };
  return messages[error.code] || error.message || "Er ging iets mis. Probeer het opnieuw.";
}
function householdCollection(name) {
  if (!householdId) throw new Error("Er is nog geen huishouden gekoppeld.");
  return collection(db, "households", householdId, name);
}
function stopListeners() { unsubscribeFns.forEach(fn => fn()); unsubscribeFns = []; }

function subscribeData() {
  stopListeners();
  const listen = (name, setter, orderField = "createdAt") => {
    const q = query(householdCollection(name), orderBy(orderField, "desc"));
    const unsub = onSnapshot(q, snap => {
      setter(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      renderAll();
    }, error => showToast(friendlyError(error)));
    unsubscribeFns.push(unsub);
  };
  listen("inventory", value => inventory = value);
  listen("recipes", value => recipes = value);
  listen("shopping", value => shopping = value);

  // Vandaag document luisteren
  const todayRef = doc(db, "households", householdId, "dayPlans", todayKey);
  unsubscribeFns.push(onSnapshot(todayRef, snap => {
    todayData = snap.exists() ? (snap.data() || { name: "", ingredients: [] }) : { name: "", ingredients: [] };
    renderToday();
    renderTodayRecipeSelect();
  }, error => showToast(friendlyError(error))));
}

function setAuthMode(register) {
  isRegisterMode = register;
  $("auth-title").textContent = register ? "Maak jullie account." : "Fijn dat je er bent.";
  $("auth-description").textContent = register ? "Maak een account met e-mail en wachtwoord." : "Log in om jullie keuken te openen.";
  $("auth-submit").textContent = register ? "Account maken" : "Inloggen";
  $("switch-copy").textContent = register ? "Heb je al een account?" : "Nog geen account?";
  $("switch-auth").textContent = register ? "Inloggen" : "Account maken";
  $("password").autocomplete = register ? "new-password" : "current-password";
  showMessage("");
}

$("switch-auth").addEventListener("click", () => setAuthMode(!isRegisterMode));
$("auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  showMessage("");
  $("auth-submit").disabled = true;
  try {
    const email = $("email").value.trim();
    const password = $("password").value;
    if (isRegisterMode) await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showMessage(friendlyError(error));
  } finally {
    $("auth-submit").disabled = false;
  }
});
$("logout-btn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async user => {
  stopListeners();
  currentUser = user;
  if (!user) {
    householdId = null;
    isEditingTodayMeal = false;
    $("auth-view").classList.remove("hidden");
    $("app-view").classList.add("hidden");
    $("user-area").classList.add("hidden");
    inventory = []; recipes = []; shopping = []; todayData = { name: "", ingredients: [] };
    return;
  }
  $("auth-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  $("user-area").classList.remove("hidden");
  $("user-email").textContent = user.email || "Ingelogd";
  
  if ($("today-label")) {
    $("today-label").textContent = dateNow.toLocaleDateString("nl-NL",{weekday:"long",day:"numeric",month:"short"});
  }
  if ($("today-name-display")) {
    $("today-name-display").textContent = "Menu van vandaag";
  }
  if ($("today-date-display")) {
    $("today-date-display").textContent = dateNow.toLocaleDateString("nl-NL",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  }

  try {
    const profileRef = doc(db, "users", user.uid);
    const profile = await getDoc(profileRef);
    if (!profile.exists() || !profile.data().householdId) {
      // Als er nog geen profiel is gekoppeld, vangen we dit af of koppelen we tijdelijk terug naar je bestaande huishouden
      householdId = "kielastraat-27"; // Valt terug op jouw project ID / huishouden
    } else {
      householdId = profile.data().householdId;
    }
    subscribeData();
  } catch (error) {
    householdId = "kielastraat-27";
    subscribeData();
  }
});

function escapeHtml(value="") {
  return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}

function renderAll() {
  renderInventory();
  renderRecipes();
  renderShopping();
  renderToday();
  renderTodayRecipeSelect();
  $("inventory-count").textContent = inventory.length;
  $("shopping-count").textContent = shopping.filter(item => !item.checked).length;
}

function renderInventory() {
  $("inventory-list").innerHTML = inventory.map(item => `
    <div class="item-row">
      <div class="item-main">
        <div class="item-name">${escapeHtml(item.name)}</div>
      </div>
      <div class="item-amount">
        <input class="inventory-quantity" type="number" min="0" step="any" value="${escapeHtml(String(item.quantity))}" data-action="update-inventory-quantity" data-id="${item.id}" aria-label="Hoeveelheid voor ${escapeHtml(item.name)}">
        <span>${escapeHtml(item.unitOfMeasurement)}</span>
      </div>
      <button class="small-button" data-action="edit-inventory" data-id="${item.id}">Wijzig naam</button>
      <button class="small-button delete-button" data-action="delete-inventory" data-id="${item.id}">Verwijder</button>
    </div>
  `).join("");
  $("inventory-empty").classList.toggle("hidden", inventory.length > 0);
}

function renderRecipes() {
  $("recipes-list").innerHTML = recipes.map(recipe => {
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    return `<article class="recipe-card"><h3>${escapeHtml(recipe.name)}</h3><p>${Number(recipe.servings)||2} porties</p>
      <h4>Ingrediënten</h4><ul>${ingredients.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      ${recipe.method ? `<h4>Bereiding</h4><p>${escapeHtml(recipe.method).replace(/\n/g,"<br>")}</p>` : ""}
      <div class="recipe-actions"><button class="small-button delete-button" data-action="delete-recipe" data-id="${recipe.id}">Verwijder recept</button></div></article>`;
  }).join("");
  $("recipes-empty").classList.toggle("hidden", recipes.length > 0);
}

function renderShopping() {
  const visibleShopping = hideCheckedShopping ? shopping.filter(item => !item.checked) : shopping;
  $("shopping-list").innerHTML = visibleShopping.map(item => `
    <div class="item-row ${item.checked ? "checked" : ""}">
      <input class="shopping-check" type="checkbox" data-action="toggle-shopping" data-id="${item.id}" ${item.checked ? "checked" : ""} aria-label="Vink ${escapeHtml(item.name)} af">
      <div class="item-main">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-sub">${item.quantity ? escapeHtml(String(item.quantity)) : ""} ${item.unitOfMeasurement ? escapeHtml(item.unitOfMeasurement) : ""}</div>
      </div>
    </div>`).join("");
  const emptyMessage = $("shopping-empty");
  const allItemsHidden = shopping.length > 0 && visibleShopping.length === 0;
  emptyMessage.textContent = allItemsHidden
    ? "Alle boodschappen zijn afgestreept. Zet de schakelaar uit om ze weer te zien."
    : "Jullie lijst is leeg. Wat moet er mee uit de winkel?";
  emptyMessage.classList.toggle("hidden", visibleShopping.length > 0);
  const checkedCount = shopping.filter(item => item.checked).length;
  $("hide-checked-shopping").closest("label").classList.toggle("hidden", checkedCount === 0);
  $("delete-checked-shopping").disabled = checkedCount === 0;
}

function findPlannedRecipe() {
  const plannedMealName = typeof todayData.name === "string" ? todayData.name.trim().toLocaleLowerCase("nl-NL") : "";
  return plannedMealName
    ? recipes.find(recipe => String(recipe.name || "").trim().toLocaleLowerCase("nl-NL") === plannedMealName)
    : null;
}

function renderToday() {
  if ($("today-meal-name") && document.activeElement !== $("today-meal-name")) {
    $("today-meal-name").value = todayData.name || "";
  }
  if ($("today-meal-ingredients") && document.activeElement !== $("today-meal-ingredients")) {
    const ingredientsArr = Array.isArray(todayData.ingredients) ? todayData.ingredients : [];
    $("today-meal-ingredients").value = ingredientsArr.join("\n");
  }

  const plannedMealName = typeof todayData.name === "string" ? todayData.name.trim() : "";
  const hasSavedMeal = Boolean(plannedMealName);
  const summary = $("today-planned-summary");
  const editor = $("today-meal-editor");
  const topActions = document.querySelector(".today-top-actions");
  if (summary && editor) {
    const showSummary = hasSavedMeal && !isEditingTodayMeal;
    summary.classList.toggle("hidden", !showSummary);
    editor.classList.toggle("hidden", hasSavedMeal && !isEditingTodayMeal);
    if (topActions) topActions.classList.toggle("hidden", hasSavedMeal && !isEditingTodayMeal);
    $("today-plan-save").textContent = isEditingTodayMeal
      ? "Wijzigingen opslaan & boodschappen bijwerken"
      : "Plan in & zet ontbrekend op boodschappen";
    $("cancel-today-edit").classList.toggle("hidden", !isEditingTodayMeal);

    if (hasSavedMeal) {
      const ingredients = Array.isArray(todayData.ingredients) ? todayData.ingredients : [];
      const plannedRecipe = findPlannedRecipe();
      const method = typeof plannedRecipe?.method === "string" ? plannedRecipe.method.trim() : "";
      summary.innerHTML = `<h3>${escapeHtml(plannedMealName)}</h3>
        <h4>Ingrediënten</h4>
        ${ingredients.length ? `<ul>${ingredients.map((item, index) => {
          const parsed = splitIngredientQuantity(item);
          return `<li><input class="planned-ingredient-quantity" type="number" min="0" step="any" value="${escapeHtml(parsed.quantity)}" data-action="update-meal-ingredient" data-index="${index}" aria-label="Hoeveelheid voor ${escapeHtml(parsed.detail || item)}"><span>${escapeHtml(parsed.detail)}</span></li>`;
        }).join("")}</ul>` : "<p>Geen ingrediënten opgeslagen.</p>"}
        ${method ? `<h4>Bereiding</h4><p>${escapeHtml(method).replace(/\n/g, "<br>")}</p>` : ""}
        <div class="planned-meal-actions">
          <button class="today-edit-button" type="button" data-action="edit-today-meal" aria-label="Wijzig maaltijd" title="Wijzig maaltijd">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m16 4 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></svg>
          </button>
          <button class="button button-primary" data-action="deduct-inventory">🍳 Opperdepop! (Kook & boek uit voorraad)</button>
        </div>`;
    } else {
      summary.innerHTML = "";
    }
  }

  const opperdepopBtn = document.querySelector("[data-action='deduct-inventory']");
  if (opperdepopBtn) {
    opperdepopBtn.classList.toggle("hidden", !hasSavedMeal);
  }
}

function renderTodayRecipeSelect() {
  const select = $("today-recipe-select");
  if (!select) return;
  const plannedMealName = typeof todayData.name === "string" ? todayData.name.trim() : "";
  const plannedRecipe = findPlannedRecipe();
  const prompt = plannedMealName && !plannedRecipe
    ? `Ingepland: ${escapeHtml(plannedMealName)}`
    : "-- Kies een recept of typ handmatig --";

  select.innerHTML = `<option value="">${prompt}</option>` +
    recipes.map(recipe => {
      const label = `${escapeHtml(recipe.name)} (${Number(recipe.servings)||2} porties)`;
      const scheduledLabel = recipe === plannedRecipe ? `Ingepland: ${label}` : label;
      return `<option value="${recipe.id}">${scheduledLabel}</option>`;
    }).join("");
  select.value = plannedRecipe ? plannedRecipe.id : "";
  select.disabled = Boolean(plannedMealName) && !isEditingTodayMeal;
}

function parseIngredientString(str) {
  const clean = str.trim();
  const match = clean.match(/^([0-9]+([.,][0-9]+)?)\s*(g|kg|ml|l|st|stuk[s]?)?\s+(.*)$/i);
  if (match) {
    return {
      qty: Number(match[1].replace(",", ".")),
      unit: (match[3] || "st").toLowerCase(),
      name: match[4].trim()
    };
  }
  return { qty: 1, unit: "st", name: clean };
}

function splitIngredientQuantity(str) {
  const clean = String(str || "").trim();
  const match = clean.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(.*)$/);
  return match
    ? { quantity: match[1].replace(",", "."), detail: match[2] }
    : { quantity: "1", detail: clean };
}

$("toggle-inventory-form").addEventListener("click", () => {
  const form = $("inventory-form");
  form.classList.toggle("hidden");
  if (!form.classList.contains("hidden")) {
    $("item-name").focus();
  }
});

$("inventory-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!householdId) return;
  const name = $("item-name").value.trim();
  const quantity = Number($("item-quantity").value);
  const unitOfMeasurement = $("item-unit").value;
  try {
    await addDoc(householdCollection("inventory"), { name, quantity, unitOfMeasurement, createdAt: serverTimestamp() });
    event.target.reset();
    $("inventory-form").classList.add("hidden");
    showToast("Toegevoegd aan voorraad.");
  } catch (error) { showToast(friendlyError(error)); }
});

$("recipe-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!householdId) return;
  const ingredients = $("recipe-ingredients").value.split("\n").map(x=>x.trim()).filter(Boolean);
  try {
    const servingsInput = $("recipe-servings");
    await addDoc(householdCollection("recipes"), { 
      name: $("recipe-name").value.trim(), 
      ingredients, 
      method: $("recipe-method").value.trim(), 
      servings: servingsInput ? Number(servingsInput.value)||2 : 2, 
      createdAt: serverTimestamp() 
    });
    event.target.reset(); 
    if (servingsInput) servingsInput.value = "2";
    showToast("Recept bewaard.");
  } catch(error) { showToast(friendlyError(error)); }
});

$("shopping-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!householdId) return;
  try {
    await addDoc(householdCollection("shopping"), {
      name: $("shopping-name").value.trim(),
      quantity: Number($("shopping-quantity").value) || 1,
      unitOfMeasurement: $("shopping-unit").value,
      checked: false,
      createdAt: serverTimestamp()
    });
    event.target.reset();
    const qField = $("shopping-quantity");
    if (qField) qField.value = "1";
    showToast("Op de boodschappenlijst gezet.");
  } catch(error) { showToast(friendlyError(error)); }
});

document.body.addEventListener("change", async event => {
  if (event.target.id === "hide-checked-shopping") {
    hideCheckedShopping = event.target.checked;
    renderShopping();
    return;
  }

  if (event.target.matches("[data-action='update-inventory-quantity']") && householdId) {
    const item = inventory.find(entry => entry.id === event.target.dataset.id);
    const quantity = Number(event.target.value);
    if (!item || !Number.isFinite(quantity) || quantity < 0) return;

    try {
      await updateDoc(doc(db, "households", householdId, "inventory", item.id), { quantity });
      showToast("Voorraadhoeveelheid bijgewerkt.");
    } catch (error) {
      event.target.value = String(item.quantity);
      showToast(friendlyError(error));
    }
  }

  if (event.target.matches("[data-action='update-meal-ingredient']") && householdId) {
    const index = Number(event.target.dataset.index);
    const quantity = Number(event.target.value);
    const ingredients = Array.isArray(todayData.ingredients) ? [...todayData.ingredients] : [];
    if (!Number.isInteger(index) || index < 0 || index >= ingredients.length || !Number.isFinite(quantity) || quantity < 0) return;

    const previousIngredients = [...ingredients];
    const { detail } = splitIngredientQuantity(ingredients[index]);
    ingredients[index] = detail ? `${quantity} ${detail}` : String(quantity);
    todayData = { ...todayData, ingredients };
    renderToday();

    try {
      await updateDoc(doc(db, "households", householdId, "dayPlans", todayKey), {
        ingredients,
        updatedAt: serverTimestamp()
      });
      showToast("Hoeveelheid bijgewerkt.");
    } catch (error) {
      todayData = { ...todayData, ingredients: previousIngredients };
      renderToday();
      showToast(friendlyError(error));
    }
  }

  if (event.target.id === "today-recipe-select") {
    const recipeId = event.target.value;
    if (!recipeId) return;
    const selectedRecipe = recipes.find(r => r.id === recipeId);
    if (selectedRecipe) {
      $("today-meal-name").value = selectedRecipe.name || "";
      const ingredients = Array.isArray(selectedRecipe.ingredients) ? selectedRecipe.ingredients : [];
      $("today-meal-ingredients").value = ingredients.join("\n");
      showToast(`Recept "${selectedRecipe.name}" ingeladen!`);
    }
  }

  if (event.target.matches("[data-action='toggle-shopping']") && householdId) {
    const id = event.target.dataset.id;
    const isChecked = event.target.checked;
    try {
      await updateDoc(doc(db, "households", householdId, "shopping", id), { checked: isChecked });
      if (isChecked) {
        const item = shopping.find(x => x.id === id);
        if (item) {
          await addDoc(householdCollection("inventory"), {
            name: item.name,
            quantity: Number(item.quantity) || 1,
            unitOfMeasurement: item.unitOfMeasurement || "st",
            createdAt: serverTimestamp()
          });
          showToast(`"${item.name}" afgetakt en toegevoegd aan voorraad!`);
        }
      }
    } catch(error) { showToast(friendlyError(error)); }
  }
});

document.body.addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button || !householdId) return;
  const { action, id } = button.dataset;
  
  try {
    if (action === "edit-today-meal") {
      isEditingTodayMeal = true;
      renderToday();
      renderTodayRecipeSelect();
      return;
    }

    if (action === "cancel-edit-today-meal") {
      isEditingTodayMeal = false;
      renderToday();
      renderTodayRecipeSelect();
      return;
    }

    if (action === "delete-checked-shopping") {
      const checkedItems = shopping.filter(item => item.checked);
      if (!checkedItems.length) return;
      await Promise.all(checkedItems.map(item => deleteDoc(doc(db, "households", householdId, "shopping", item.id))));
      showToast(`${checkedItems.length} afgestreepte boodschap${checkedItems.length === 1 ? "" : "pen"} verwijderd.`);
      return;
    }

    if (action === "save-and-shopping") {
        const isEditing = isEditingTodayMeal;
      const name = $("today-meal-name").value.trim();
      const ingredients = $("today-meal-ingredients").value.split("\n").map(x => x.trim()).filter(Boolean);
      if (!name) { showToast("Geef de maaltijd eerst een naam."); return; }
      if (!ingredients.length) { showToast("Vul eerst de ingrediënten in."); return; }

      await setDoc(doc(db, "households", householdId, "dayPlans", todayKey), { name, ingredients, updatedAt: serverTimestamp() });

      const normalize = v => String(v).toLocaleLowerCase("nl-NL").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const missing = ingredients.filter(ingredient => {
        const ingredientName = normalize(parseIngredientString(ingredient).name);
        const inInventory = inventory.some(item => {
          const itemName = normalize(item.name);
          return itemName === ingredientName || itemName.includes(ingredientName) || ingredientName.includes(itemName);
        });
        const onShoppingList = shopping.some(item => !item.checked && normalize(item.name) === ingredientName);
        return !inInventory && !onShoppingList;
      });
      
      for (const ing of missing) {
        const parsed = parseIngredientString(ing);
        await addDoc(householdCollection("shopping"), {
          name: parsed.name,
          quantity: parsed.qty,
          unitOfMeasurement: parsed.unit,
          checked: false,
          createdAt: serverTimestamp()
        });
      }
      todayData = { ...todayData, name, ingredients };
      isEditingTodayMeal = false;
      renderToday();
      renderTodayRecipeSelect();
      if (!missing.length) {
        showToast(isEditing
          ? "Maaltijd bijgewerkt. Er zijn geen nieuwe boodschappen nodig."
          : "Menu opgeslagen! Volgens de voorraad is alles al in huis.");
        return;
      }
      showToast(isEditing
        ? `Maaltijd bijgewerkt! ${missing.length} nieuwe ingrediënt(en) op de boodschappenlijst gezet.`
        : `Menu opgeslagen! ${missing.length} ontbrekende ingrediënt(en) op de boodschappenlijst gezet.`);
      return;
    }

    if (action === "save-as-recipe") {
      const name = $("today-meal-name").value.trim();
      const ingredients = $("today-meal-ingredients").value.split("\n").map(x => x.trim()).filter(Boolean);
      if (!name) { showToast("Geef het gerecht eerst een naam."); return; }
      await addDoc(householdCollection("recipes"), { name, ingredients, method: "", servings: 2, createdAt: serverTimestamp() });
      showToast("⭐ Opgeslagen als nieuw recept in jullie bibliotheek!");
      return;
    }

    if (action === "deduct-inventory") {
      const ingredients = $("today-meal-ingredients").value.split("\n").map(x => x.trim()).filter(Boolean);
      if (!ingredients.length) { showToast("Geen ingrediënten ingevuld om af te boeken."); return; }

      let deductedCount = 0;
      for (const ing of ingredients) {
        const parsed = parseIngredientString(ing);
        const normalize = v => String(v).toLocaleLowerCase("nl-NL").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const match = inventory.find(item => normalize(item.name) === normalize(parsed.name) || normalize(item.name).includes(normalize(parsed.name)));
        
        if (match) {
          const newQty = Math.max(0, Number(match.quantity) - parsed.qty);
          await updateDoc(doc(db, "households", householdId, "inventory", match.id), { quantity: newQty });
          deductedCount++;
        }
      }
      showToast(`🍳 Opperdepop! ${deductedCount} ingrediënt(en) afgeschreven van de voorraad.`);
      return;
    }

    if (action === "delete-inventory") await deleteDoc(doc(db, "households", householdId, "inventory", id));
    if (action === "delete-recipe") await deleteDoc(doc(db, "households", householdId, "recipes", id));
    if (action === "edit-inventory") {
      const item = inventory.find(x => x.id === id);
      if (!item) return;
      const name = prompt("Productnaam:", item.name);
      if (name === null || !name.trim()) return;
      const qInput = prompt("Hoeveelheid:", String(item.quantity));
      if (qInput === null) return;
      const quantity = Number(qInput);
      const unit = prompt("Eenheid (g, kg, ml, l, st):", item.unitOfMeasurement);
      if (unit === null) return;

      await updateDoc(doc(db, "households", householdId, "inventory", id), { name: name.trim(), quantity, unitOfMeasurement: unit.trim().toLowerCase() });
      showToast("Product bijgewerkt.");
    }
  } catch(error) { showToast(friendlyError(error)); }
});

document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab === button));
  document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.add("hidden"));
  const targetId = `tab-${button.dataset.tab}`;
  if ($(targetId))$(targetId).classList.remove("hidden");
}));
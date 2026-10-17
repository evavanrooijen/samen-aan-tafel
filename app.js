import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

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
let week = {};
let unsubscribeFns = [];
let toastTimer;

const days = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
const dateNow = new Date();
const monday = new Date(dateNow);
monday.setHours(0,0,0,0);
monday.setDate(monday.getDate() + ((1 - monday.getDay() + 7) % 7));
const weekKey = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,"0")}-${String(monday.getDate()).padStart(2,"0")}`;

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
    "permission-denied": "Geen toegang tot deze gedeelde gegevens. Controleer de gebruikerskoppeling en Firestore-regels."
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
  const weekRef = doc(db, "households", householdId, "weekPlans", weekKey);
  unsubscribeFns.push(onSnapshot(weekRef, snap => {
    week = snap.exists() ? (snap.data().days || {}) : {};
    renderWeek();
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
    $("auth-view").classList.remove("hidden");
    $("app-view").classList.add("hidden");
    $("user-area").classList.add("hidden");
    inventory = []; recipes = []; shopping = []; week = {};
    return;
  }
  $("auth-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  $("user-area").classList.remove("hidden");
  $("user-email").textContent = user.email || "Ingelogd";
  $("today-label").textContent = `Week van ${monday.toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}`;
  try {
    const profileRef = doc(db, "users", user.uid);
    // Het profiel wordt bewust niet automatisch aangemaakt: householdId moet door de eigenaar
    // in Firestore Console worden ingesteld, zodat een willekeurige gebruiker niet kan meekijken.
    const { getDoc } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");
    const profile = await getDoc(profileRef);
    if (!profile.exists() || !profile.data().householdId) {
      $("app-view").classList.add("hidden");
      $("auth-view").classList.remove("hidden");
      $("auth-title").textContent = "Nog één stapje.";
      $("auth-description").textContent = "Je account is aangemaakt, maar nog niet gekoppeld aan jullie gedeelde huishouden.";
      showMessage("Koppel dit account in Firestore Console aan het huishouden. Volg de SETUP.md in het project.");
      return;
    }
    householdId = profile.data().householdId;
    subscribeData();
  } catch (error) {
    showToast(friendlyError(error));
  }
});

function escapeHtml(value="") {
  return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function renderAll() {
  renderInventory();
  renderRecipes();
  renderShopping();
  $("inventory-count").textContent = inventory.length;
  $("recipe-count").textContent = recipes.length;
  $("shopping-count").textContent = shopping.filter(item => !item.checked).length;
  renderWeek();
}

function renderInventory() {
  $("inventory-list").innerHTML = inventory.map(item => `
    <div class="item-row">
      <div class="item-main">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-sub">
          ${escapeHtml(String(item.quantity))} ${escapeHtml(item.unitOfMeasurement)}
        </div>
      </div>
      <button class="small-button" data-action="edit-inventory" data-id="${item.id}">Wijzig</button>
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
  $("shopping-list").innerHTML = shopping.map(item => `
    <div class="item-row ${item.checked ? "checked" : ""}">
      <input class="shopping-check" type="checkbox" data-action="toggle-shopping" data-id="${item.id}" ${item.checked ? "checked" : ""} aria-label="Vink ${escapeHtml(item.name)} af">
      <div class="item-main"><div class="item-name">${escapeHtml(item.name)}</div></div>
      <button class="small-button delete-button" data-action="delete-shopping" data-id="${item.id}">Verwijder</button>
    </div>`).join("");
  $("shopping-empty").classList.toggle("hidden", shopping.length > 0);
}
function renderWeek() {
  $("week-list").innerHTML = days.map((day, index) => {
    const date = new Date(monday); date.setDate(monday.getDate()+index);
    const selected = week[day] || "";
    return `<div class="day-row"><div><div class="day-name">${day}</div><div class="day-date">${date.toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}</div></div>
      <select data-day="${day}" aria-label="Recept voor ${day}"><option value="">Nog niets gepland</option>${recipes.map(r => `<option value="${r.id}" ${selected===r.id?"selected":""}>${escapeHtml(r.name)}</option>`).join("")}</select></div>`;
  }).join("");
}
$("inventory-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!householdId) return;

  const name = $("item-name").value.trim();
  const quantity = Number($("item-quantity").value);
  const unitOfMeasurement = $("item-unit").value;

  if (!name || !Number.isFinite(quantity) || quantity < 0) {
    showToast("Vul een geldige productnaam en hoeveelheid in.");
    return;
  }

  try {
    await addDoc(householdCollection("inventory"), {
      name,
      quantity,
      unitOfMeasurement,
      createdAt: serverTimestamp()
    });

    event.target.reset();
    $("item-name").focus();
    showToast("Toegevoegd aan jullie voorraad.");
  } catch (error) {
    showToast(friendlyError(error));
  }
});
$("recipe-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!householdId) return;
  const ingredients = $("recipe-ingredients").value.split("\n").map(x=>x.trim()).filter(Boolean);
  try {
    await addDoc(householdCollection("recipes"), { name: $("recipe-name").value.trim(), ingredients, method: $("recipe-method").value.trim(), servings: Number($("recipe-servings").value)||2, createdAt: serverTimestamp() });
    event.target.reset(); $("recipe-servings").value = "2"; showToast("Recept bewaard.");
  } catch(error) { showToast(friendlyError(error)); }
});
$("shopping-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!householdId) return;
  try {
    await addDoc(householdCollection("shopping"), { name: $("shopping-name").value.trim(), checked: false, createdAt: serverTimestamp() });
    event.target.reset(); $("shopping-name").focus(); showToast("Op de boodschappenlijst gezet.");
  } catch(error) { showToast(friendlyError(error)); }
});
document.body.addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button || !householdId) return;
  const {action,id} = button.dataset;
  try {
    if (action === "delete-inventory") await deleteDoc(doc(db,"households",householdId,"inventory",id));
    if (action === "delete-recipe") await deleteDoc(doc(db,"households",householdId,"recipes",id));
    if (action === "delete-shopping") await deleteDoc(doc(db,"households",householdId,"shopping",id));
if (action === "edit-inventory") {
  const item = inventory.find(x => x.id === id);
  if (!item) return;

  const name = prompt("Productnaam:", item.name);
  if (name === null || !name.trim()) return;

  const quantityInput = prompt("Hoeveelheid:", String(item.quantity));
  if (quantityInput === null) return;

  const quantity = Number(quantityInput);
  if (quantityInput.trim() === "" || !Number.isFinite(quantity) || quantity < 0) {
    showToast("Vul een geldige hoeveelheid in.");
    return;
  }

  const unitInput = prompt(
    "Eenheid (g, kg, ml, l of st):",
    item.unitOfMeasurement
  );
  if (unitInput === null) return;

  const unitOfMeasurement = unitInput.trim().toLowerCase();
  const allowedUnits = ["g", "kg", "ml", "l", "st"];

  if (!allowedUnits.includes(unitOfMeasurement)) {
    showToast("Kies g, kg, ml, l of st.");
    return;
  }

  try {
    await updateDoc(
      doc(db, "households", householdId, "inventory", id),
      {
        name: name.trim(),
        quantity,
        unitOfMeasurement
      }
    );

    showToast("Product bijgewerkt.");
  } catch (error) {
    showToast(friendlyError(error));
  }
}

    showToast("Opgeslagen.");
  } catch(error) { showToast(friendlyError(error)); }
});
document.body.addEventListener("change", async event => {
  if (event.target.matches("[data-action='toggle-shopping']") && householdId) {
    try { await updateDoc(doc(db,"households",householdId,"shopping",event.target.dataset.id),{checked:event.target.checked}); }
    catch(error) { showToast(friendlyError(error)); }
  }
  if (event.target.matches("select[data-day]") && householdId) {
    const next = {...week, [event.target.dataset.day]:event.target.value};
    try {
      await setDoc(doc(db,"households",householdId,"weekPlans",weekKey),{days:next,updatedAt:serverTimestamp()},{merge:true});
      showToast("Weekplan bijgewerkt.");
    } catch(error) { showToast(friendlyError(error)); }
  }
});
document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(tab=>tab.classList.toggle("active",tab===button));
  document.querySelectorAll(".tab-panel").forEach(panel=>panel.classList.add("hidden"));
  $(`tab-${button.dataset.tab}`).classList.remove("hidden");
}));
$("clear-week").addEventListener("click", async () => {
  if (!householdId || !confirm("Alle gerechten uit deze weekplanning verwijderen?")) return;
  try {
    await setDoc(doc(db,"households",householdId,"weekPlans",weekKey),{days:{},updatedAt:serverTimestamp()});
    showToast("Weekplan leeggemaakt.");
  } catch(error) { showToast(friendlyError(error)); }
});

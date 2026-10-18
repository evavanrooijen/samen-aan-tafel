const { GoogleGenAI } = require("@google/genai");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { createRecipePrompt, mapGeminiError, parseRecipe, validateIngredients } = require("./recipe");

initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const recipeSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Een korte Nederlandse receptnaam." },
    ingredients: {
      type: "array",
      items: { type: "string" },
      description: "Ingrediënten met hoeveelheden en eenheden."
    },
    method: { type: "string", description: "Een korte bereidingswijze in het Nederlands." },
    servings: { type: "integer", description: "Het aantal porties." }
  },
  required: ["name", "ingredients", "method", "servings"]
};

exports.generateRecipe = onCall({
  region: "europe-west1",
  secrets: [geminiApiKey],
  timeoutSeconds: 60,
  maxInstances: 3
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Log in om een receptvoorstel te laten maken.");
  }

  let ingredients;
  try {
    ingredients = validateIngredients(request.data?.ingredients);
  } catch (error) {
    throw new HttpsError("invalid-argument", error.message);
  }

  const profile = await getFirestore().collection("users").doc(request.auth.uid).get();
  if (!profile.exists || typeof profile.get("householdId") !== "string" || !profile.get("householdId").trim()) {
    throw new HttpsError("permission-denied", "Je account is niet gekoppeld aan een huishouden.");
  }

  let response;
  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: createRecipePrompt(ingredients),
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: recipeSchema,
        maxOutputTokens: 1000,
        temperature: 0.5
      }
    });
  } catch (error) {
    const mappedError = mapGeminiError(error);
    logger.error("Gemini recipe request failed", {
      name: error?.name || "UnknownError",
      status: error?.status || "unknown",
      message: typeof error?.message === "string" ? error.message.slice(0, 500) : "No provider message",
      code: mappedError.code
    });
    throw new HttpsError(mappedError.code, mappedError.message);
  }

  try {
    const recipe = parseRecipe(response.text);
    return { recipe };
  } catch (error) {
    logger.error("Gemini returned an invalid recipe response", { message: error.message });
    throw new HttpsError("internal", "De AI gaf geen bruikbaar recept terug. Probeer het opnieuw.");
  }
});

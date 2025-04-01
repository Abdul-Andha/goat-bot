// commands/cals.js

import { SlashCommandBuilder } from "discord.js";
import axios from "axios";
import natural from "natural";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

// Direct key input for testing
const appId = process.env.EDAMAM_APP_ID;
const appKey = process.env.EDAMAM_APP_KEY;

// Setup __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup tokenizer and tagger
const tokenizer = new natural.WordTokenizer();
const baseFolder = "node_modules/natural/lib/natural/brill_pos_tagger";
const rulesFilename = path.join(
  __dirname,
  "..",
  baseFolder,
  "data",
  "English",
  "tr_from_posjs.txt"
);
const lexiconFilename = path.join(
  __dirname,
  "..",
  baseFolder,
  "data",
  "English",
  "lexicon_from_posjs.json"
);
const defaultCategory = "NN";
const lexicon = new natural.Lexicon(lexiconFilename, defaultCategory);
const rules = new natural.RuleSet(rulesFilename);
const tagger = new natural.BrillPOSTagger(lexicon, rules);

// Slash command metadata
export const data = new SlashCommandBuilder()
  .setName("cals")
  .setDescription("Analyze calories from your food input.")
  .addStringOption((option) =>
    option
      .setName("food") // 👈 label in the prompt
      .setDescription('e.g., "I had 2 eggs and a glass of milk"')
      .setRequired(true)
  );

// Main logic
export async function execute(interaction) {
  const input = interaction.options.getString("food");
  await interaction.deferReply();

  try {
    const result = await analyzeFoodInput(input);

    if (!Object.keys(result).length) {
      await interaction.editReply("⚠️ I couldn't find any valid food items.");
      return;
    }

    // Build the reply string
    let reply = "**🍽️ Nutritional Info Breakdown:**";
    for (const [food, info] of Object.entries(result)) {
      reply += `\n\n**### ${capitalize(food)}**`;
      reply += `\n- Quantity: ${info.quantity}`;
      reply += `\n- Calories: ${info.calories.toFixed(2)}`;
      reply += `\n- Protein: ${info.protein.toFixed(2)}g`;
      reply += `\n- Carbs: ${info.carbs.toFixed(2)}g`;
      reply += `\n- Fat: ${info.fat.toFixed(2)}g`;
    }

    await interaction.editReply(reply);
  } catch (error) {
    console.error("Error in /cals command:", error);
    await interaction.editReply(
      "❌ An error occurred while analyzing your food."
    );
  }
}

// --- Helpers ---
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function parseFoodInput(text) {
  const tokens = tokenizer.tokenize(text);
  const tagged = tagger.tag(tokens).taggedWords;

  const foodItems = [];
  let currentQty = "";
  let currentFood = "";

  for (const { token: word, tag } of tagged) {
    if (tag.startsWith("CD")) {
      currentQty = word;
    } else if (tag.startsWith("NN")) {
      currentFood = word;
      foodItems.push([currentQty, currentFood]);
      currentQty = "";
    }
  }

  return foodItems;
}

async function getNutritionalData(foodItem) {
  try {
    const url = `https://api.edamam.com/api/food-database/v2/parser?app_id=${appId}&app_key=${appKey}&ingr=${encodeURIComponent(
      foodItem
    )}`;
    const response = await axios.get(url);
    const data = response.data;

    if (response.status === 200 && data?.parsed?.length) {
      const nutrients = data.parsed[0].food.nutrients;
      return [
        nutrients.ENERC_KCAL,
        nutrients.PROCNT,
        nutrients.CHOCDF,
        nutrients.FAT,
      ];
    }
  } catch (error) {
    console.error(`Error fetching data for "${foodItem}":`, error.message);
  }

  return [null, null, null, null];
}

async function analyzeFoodInput(text) {
  const parsedFood = parseFoodInput(text);
  const foodData = {};

  for (const [qty, food] of parsedFood) {
    const [calories, protein, carbs, fat] = await getNutritionalData(food);

    if (calories !== null) {
      foodData[food] = {
        quantity: qty,
        calories,
        protein,
        carbs,
        fat,
      };
    }
  }

  return foodData;
}

// --- Simple test runner to simulate Discord interaction with node ---
// cli: node commands/cals.js "2 eggs and 1 cup of fried rice"
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Fake input for testing
  const testInput =
    process.argv.slice(2).join(" ") || "I had 2 eggs and a glass of milk";

  // Mock interaction object
  const mockInteraction = {
    options: {
      getString: () => testInput,
    },
    async deferReply() {
      console.log("🤖 Thinking...\n");
    },
    async editReply(msg) {
      console.log("✅ Final Reply:\n");
      console.log(msg);
    },
  };

  // Run the slash command logic
  execute(mockInteraction);
}

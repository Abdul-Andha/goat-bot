// commands/joke.js

import { SlashCommandBuilder } from 'discord.js';
import { Configuration, OpenAIApi } from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export const data = new SlashCommandBuilder()
  .setName('joke')
  .setDescription('Tells a short, funny joke.');

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const prompt = 'Tell me a short, hilarious joke that is surprising and witty. Avoid any offensive or inappropriate content.';

    const response = await openai.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      temperature: 0.9,
    });

    let joke = response.data.choices[0].message.content.trim();

    // Content Moderation
    const moderationResponse = await openai.createModeration({
      input: joke,
    });

    const [results] = moderationResponse.data.results;

    if (results.flagged) {
      await interaction.editReply('Sorry, I couldn\'t come up with a joke right now. Please try again later.');
    } else {
      await interaction.editReply(joke);
    }
  } catch (error) {
    console.error('Error with OpenAI API:', error);
    await interaction.editReply('An error occurred while fetching a joke.');
  }
}
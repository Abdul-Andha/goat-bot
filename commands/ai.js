// commands/ai.js

import { SlashCommandBuilder } from 'discord.js';
import { Configuration, OpenAIApi } from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export const data = new SlashCommandBuilder()
  .setName('ai')
  .setDescription('Get a response from OpenAI.')
  .addStringOption((option) =>
    option
      .setName('prompt')
      .setDescription('The prompt to send to the AI.')
      .setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const prompt = interaction.options.getString('prompt');

  try {
    // Generate AI response
    const response = await openai.createChatCompletion({
      model: 'gpt-4o-mini', 
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000, 
      temperature: 1,
    });

    let aiResponse = response.data.choices[0].message.content.trim();

    // Construct the message with question and answer
    let combinedMessage = `**Question:** ${prompt}\n**Answer:** ${aiResponse}`;

    // Ensure the response doesn't exceed Discord's character limit
    if (combinedMessage.length > 2000) {
      // Truncate the AI's response if necessary
      const allowedLength = 2000 - (`**Question:** ${prompt}\n**Answer:** `.length + 3); // +3 for '...'
      aiResponse = aiResponse.slice(0, allowedLength) + '...';
      combinedMessage = `**Question:** ${prompt}\n**Answer:** ${aiResponse}`;
    }

    // Content Moderation
    const moderationResponse = await openai.createModeration({
      input: aiResponse,
    });

    const [results] = moderationResponse.data.results;

    if (results.flagged) {
      await interaction.editReply(
        'The response was flagged by content moderation and cannot be displayed.'
      );
    } else {
      await interaction.editReply(combinedMessage);
    }
  } catch (error) {
    console.error('Error with OpenAI API:', error);

    if (error.response) {
      const status = error.response.status;

      if (status === 429) {
        await interaction.editReply(
          'Rate limit exceeded. Please try again later.'
        );
      } else if (status === 401) {
        await interaction.editReply('Invalid OpenAI API key.');
      } else {
        await interaction.editReply(
          `An error occurred: ${error.response.statusText}`
        );
      }
    } else {
      await interaction.editReply('An unexpected error occurred.');
    }
  }
}
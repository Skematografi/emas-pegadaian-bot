// Using dotenv for environment variables
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const cron = require('node-cron');
const FormData = require('form-data');

// Application constants
const API_URL = process.env.URL_PEGADAIAN;
const DATA_FILE = './temp/data.json';
const USERS_FILE = './temp/users.json';
// Use environment variables for sensitive data
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// Command definitions
const COMMANDS = {
  START: '/start',
  STOP: '/stop',
  HELP: '/help',
  BROADCAST: '/broadcast'
};

// Message templates
const MESSAGES = {
  PRICE_LIST: "*Gold Savings Price List*\n\nBuy: {buyPrice}\nSell: {sellPrice}\nLast Update: {lastUpdate}",
  BUY_PRICE_DROPPED: "⬇️ *Buy price dropped* From {oldPrice} to *{newPrice}*",
  SELL_PRICE_INCREASED: "⬆️ *Sell price increased* From {oldPrice} to *{newPrice}*",
  DATA_FETCH_ERROR: "⚠️ *Failed to fetch price data*\nError: {errorMessage}",
  WELCOME: "Welcome to Gold Price Bot! You are now subscribed to price updates. Use /help for available commands.",
  ALREADY_SUBSCRIBED: "You are already subscribed to price updates!",
  UNSUBSCRIBED: "You have unsubscribed from price updates. Use /start to subscribe again.",
  NOT_SUBSCRIBED: "You are not currently subscribed to updates.",
  HELP: "Available commands:\n/start - Subscribe to price updates\n/stop - Unsubscribe from price updates\n/help - Show this help message",
  ADMIN_HELP: "Admin commands:\n/broadcast [message] - Send message to all subscribers",
  BROADCAST_SENT: "✅ Broadcast sent to {count} users",
  UNAUTHORIZED: "You are not authorized to use this command."
};

/**
 * Send message to a specific Telegram chat
 * @param {string} chatId - Chat ID to send message to
 * @param {string} message - Message to be sent
 */
async function sendTelegramMessage(chatId, message) {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });
        console.log(`✅ Message sent to chat ${chatId}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to send Telegram message to ${chatId}:`, error.message);
        return false;
    }
}

/**
 * Broadcast message to all subscribed users
 * @param {string} message - Message to broadcast
 * @returns {number} - Number of users message was sent to
 */
async function broadcastMessage(message) {
    const users = loadUsers();
    let sentCount = 0;
    
    for (const user of users) {
        const sent = await sendTelegramMessage(user.chatId, message);
        if (sent) sentCount++;
    }
    
    return sentCount;
}

/**
 * Load users from JSON file
 * @returns {Array} - Array of user objects
 */
function loadUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
            return [];
        }
        const content = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('❌ Failed to load users:', error.message);
        return [];
    }
}

/**
 * Save users to JSON file
 * @param {Array} users - Array of user objects
 */
function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        console.log('💾 Users saved successfully');
    } catch (error) {
        console.error('❌ Failed to save users:', error.message);
    }
}

/**
 * Add a new user to subscribers
 * @param {string} chatId - Chat ID of the user
 * @param {string} username - Username of the user
 * @returns {boolean} - Whether the user was added
 */
function addUser(chatId, username) {
    const users = loadUsers();
    const existingUser = users.find(user => user.chatId === chatId);
    
    if (existingUser) {
        return false;
    }
    
    users.push({
        chatId,
        username,
        subscribedAt: new Date().toISOString()
    });
    
    saveUsers(users);
    return true;
}

/**
 * Remove a user from subscribers
 * @param {string} chatId - Chat ID of the user
 * @returns {boolean} - Whether the user was removed
 */
function removeUser(chatId) {
    const users = loadUsers();
    const initialLength = users.length;
    
    const filteredUsers = users.filter(user => user.chatId !== chatId);
    
    if (filteredUsers.length < initialLength) {
        saveUsers(filteredUsers);
        return true;
    }
    
    return false;
}

/**
 * Check if a user is subscribed
 * @param {string} chatId - Chat ID to check
 * @returns {boolean} - Whether the user is subscribed
 */
function isUserSubscribed(chatId) {
    const users = loadUsers();
    return users.some(user => user.chatId === chatId);
}

/**
 * Fetch price data from API
 * @returns {Object|null} - Price data or null if error occurs
 */
async function fetchData() {
    try {
        const form = new FormData();
        form.append('interval', 1);
        form.append('tipe', 'beli');  // previously 'pos', now 'beli'

        const response = await axios.post(API_URL, form, {
            headers: form.getHeaders(),
        });

        return response.data;
    } catch (error) {
        console.error('❌ Error fetching data:', error.message);
        await sendTelegramMessage(ADMIN_CHAT_ID, MESSAGES.DATA_FETCH_ERROR.replace('{errorMessage}', error.message));
        return null;
    }
}

/**
 * Save data to JSON file
 * @param {Object} data - Data to be saved
 */
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('💾 Data saved successfully');
    } catch (error) {
        console.error('❌ Failed to save data:', error.message);
    }
}

/**
 * Load data from JSON file
 * @returns {Object|null} - Loaded data or null if file doesn't exist or is invalid
 */
function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return null;
        const content = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('❌ Failed to load data:', error.message);
        return null;
    }
}

/**
 * Delete data file if it exists
 */
function deleteDataFile() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            fs.unlinkSync(DATA_FILE);
            console.log('🗑️ data.json file successfully deleted.');
        } else {
            console.log('ℹ️ data.json file not found.');
        }
    } catch (error) {
        console.error('❌ Error deleting data file:', error.message);
    }
}

/**
 * Format date to YYYY-MM-DD
 * @param {string} dateString - Date string to format
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0]; // Format YYYY-MM-DD
}

/**
 * Format price in IDR currency
 * @param {number} price - Price to format
 * @returns {string} - Formatted price
 */
function formatPrice(price) {
    return price.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' });
}

/**
 * Check price changes and send notifications
 */
async function checkPriceChanges() {
    const currentData = await fetchData();
    if (!currentData) return;

    try {
        let newData = {
            buyPrice: parseFloat(currentData.data.priceList[0].hargaJual),
            sellPrice: parseFloat(currentData.data.priceList[0].hargaBeli),
            lastUpdate: currentData.data.priceList[0].lastUpdate
        };
        
        const previousData = loadData();
        if (!previousData) {
            saveData(newData);
            const formattedBuyPrice = formatPrice(newData.buyPrice);
            const formattedSellPrice = formatPrice(newData.sellPrice);
            
            const message = MESSAGES.PRICE_LIST
                .replace('{buyPrice}', formattedBuyPrice)
                .replace('{sellPrice}', formattedSellPrice)
                .replace('{lastUpdate}', formatDate(newData.lastUpdate));
                
            await broadcastMessage(message);
            return;
        } else {
            newData.buyPrice -= 1000;
            newData.sellPrice += 1000;
        }

        const messages = [];

        // Check buy price changes (decreased)
        if (newData.buyPrice < previousData.buyPrice) {
            const oldBuyPrice = formatPrice(previousData.buyPrice);
            const newBuyPrice = formatPrice(newData.buyPrice);
            
            const message = MESSAGES.BUY_PRICE_DROPPED
                .replace('{oldPrice}', oldBuyPrice)
                .replace('{newPrice}', newBuyPrice);
                
            messages.push(message);
        }
        
        // Check sell price changes (increased)
        if (newData.sellPrice > previousData.sellPrice) {
            const oldSellPrice = formatPrice(previousData.sellPrice);
            const newSellPrice = formatPrice(newData.sellPrice);
            
            const message = MESSAGES.SELL_PRICE_INCREASED
                .replace('{oldPrice}', oldSellPrice)
                .replace('{newPrice}', newSellPrice);
                
            messages.push(message);
        }

        // Send all messages
        if (messages.length > 0) {
            for (const message of messages) {
                await broadcastMessage(message);
            }
        }

        saveData(newData);
    } catch (error) {
        console.error('❌ Error processing price changes:', error.message);
    }
}

/**
 * Setup Telegram webhook for receiving messages
 */
async function setupWebhook() {
    try {
        const webhookUrl = process.env.WEBHOOK_URL;
        if (!webhookUrl) {
            console.log('⚠️ No webhook URL specified in .env file');
            return;
        }
        
        const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${webhookUrl}`);
        console.log('🔄 Webhook setup response:', response.data);
    } catch (error) {
        console.error('❌ Failed to setup webhook:', error.message);
    }
}

/**
 * Process incoming messages from Telegram
 * @param {Object} update - Telegram update object
 */
async function processUpdate(update) {
    if (!update.message) return;
    
    const chatId = update.message.chat.id;
    const messageText = update.message.text || '';
    const username = update.message.from.username || 'unknown';
    
    console.log(`📩 Received message from ${username} (${chatId}): ${messageText}`);
    
    // Check if this is a command
    if (messageText.startsWith('/')) {
        const command = messageText.split(' ')[0];
        const args = messageText.substring(command.length).trim();
        
        switch (command) {
            case COMMANDS.START:
                const added = addUser(chatId, username);
                await sendTelegramMessage(chatId, added ? MESSAGES.WELCOME : MESSAGES.ALREADY_SUBSCRIBED);
                
                // Send current price data to new subscribers
                if (added) {
                    const currentData = loadData();
                    if (currentData) {
                        const formattedBuyPrice = formatPrice(currentData.buyPrice);
                        const formattedSellPrice = formatPrice(currentData.sellPrice);
                        
                        const message = MESSAGES.PRICE_LIST
                            .replace('{buyPrice}', formattedBuyPrice)
                            .replace('{sellPrice}', formattedSellPrice)
                            .replace('{lastUpdate}', formatDate(currentData.lastUpdate));
                            
                        await sendTelegramMessage(chatId, message);
                    }
                }
                break;
                
            case COMMANDS.STOP:
                const removed = removeUser(chatId);
                await sendTelegramMessage(chatId, removed ? MESSAGES.UNSUBSCRIBED : MESSAGES.NOT_SUBSCRIBED);
                break;
                
            case COMMANDS.HELP:
                let helpMessage = MESSAGES.HELP;
                
                // Add admin commands if this is the admin
                if (chatId.toString() === ADMIN_CHAT_ID) {
                    helpMessage += '\n\n' + MESSAGES.ADMIN_HELP;
                }
                
                await sendTelegramMessage(chatId, helpMessage);
                break;
                
            case COMMANDS.BROADCAST:
                // Only admin can broadcast
                if (chatId.toString() !== ADMIN_CHAT_ID) {
                    await sendTelegramMessage(chatId, MESSAGES.UNAUTHORIZED);
                    return;
                }
                
                if (args) {
                    const sentCount = await broadcastMessage(args);
                    await sendTelegramMessage(
                        chatId, 
                        MESSAGES.BROADCAST_SENT.replace('{count}', sentCount)
                    );
                } else {
                    await sendTelegramMessage(chatId, "Please provide a message to broadcast");
                }
                break;
                
            default:
                await sendTelegramMessage(chatId, `Unknown command. Use ${COMMANDS.HELP} for available commands.`);
        }
    } else {
        // If not a command and not from admin, ignore
        if (chatId.toString() !== ADMIN_CHAT_ID) {
            await sendTelegramMessage(chatId, `Use ${COMMANDS.HELP} for available commands.`);
        }
    }
}

/**
 * Express server to handle webhook requests
 */
function startServer() {
    const express = require('express');
    const bodyParser = require('body-parser');
    const app = express();
    
    app.use(bodyParser.json());
    
    app.post('/webhook', (req, res) => {
        console.log(req.body)
        processUpdate(req.body);
        res.sendStatus(200);
    });
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}

// Initialize
(async function() {
    console.log('🔄 Starting Gold Price Bot...');
    
    // Delete old data file
    deleteDataFile();
    
    // Setup webhook if specified
    await setupWebhook();
    
    // Start express server for webhook
    startServer();
    
    // Run first check immediately
    checkPriceChanges();
    
    // Schedule check every 30 minutes
    cron.schedule('*/1 * * * *', () => {
        console.log('🔄 Checking price changes...');
        checkPriceChanges();
    });
    
    console.log('✅ Bot initialized successfully');
})();

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('🛑 Process terminated. Cleaning up...');
    process.exit(0);
});
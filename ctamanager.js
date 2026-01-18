// cta-manager.js - CTA Link Management Tool
const fs = require("fs").promises;
const path = require("path");
const readline = require("readline");

class CTAManager {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.accountsDir = path.join(__dirname, "../accounts");
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async listCTALinks(accountId) {
    try {
      const ctaPath = path.join(this.accountsDir, accountId, "cta_link.txt");
      const data = await fs.readFile(ctaPath, "utf8");
      const links = data.split("\n")
        .map(line => line.trim())
        .filter(line => line && 
                line.startsWith("http") && 
                !line.startsWith("#"));
      
      console.log(`\n📋 CTA Links for ${accountId}:`);
      console.log("=====================================");
      
      links.forEach((link, index) => {
        console.log(`${index + 1}. ${link}`);
      });
      
      console.log(`\nTotal: ${links.length} links`);
    } catch (error) {
      console.error(`Error listing CTA links: ${error.message}`);
    }
  }

  async addCTALink(accountId) {
    try {
      const link = await this.question("Enter CTA link: ");
      if (!link || !link.startsWith("http")) {
        console.log("❌ Invalid link");
        return;
      }

      const ctaPath = path.join(this.accountsDir, accountId, "cta_link.txt");
      
      // Read existing links
      let existingLinks = "";
      try {
        existingLinks = await fs.readFile(ctaPath, "utf8");
      } catch (error) {
        // File doesn't exist, will be created
      }
      
      // Add new link
      const updatedContent = existingLinks + (existingLinks ? "\n" : "") + link;
      await fs.writeFile(ctaPath, updatedContent);
      
      console.log(`✅ Added CTA link for ${accountId}`);
    } catch (error) {
      console.error(`Error adding CTA link: ${error.message}`);
    }
  }

  async removeCTALink(accountId) {
    try {
      const ctaPath = path.join(this.accountsDir, accountId, "cta_link.txt");
      const data = await fs.readFile(ctaPath, "utf8");
      const links = data.split("\n")
        .map(line => line.trim())
        .filter(line => line && 
                line.startsWith("http") && 
                !line.startsWith("#"));
      
      if (links.length === 0) {
        console.log("❌ No CTA links to remove");
        return;
      }

      await this.listCTALinks(accountId);
      
      const index = await this.question("Enter link number to remove: ");
      const linkIndex = parseInt(index) - 1;
      
      if (linkIndex >= 0 && linkIndex < links.length) {
        const removedLink = links[linkIndex];
        const updatedLinks = links.filter((_, i) => i !== linkIndex);
        
        const updatedContent = updatedLinks.join("\n");
        await fs.writeFile(ctaPath, updatedContent);
        
        console.log(`✅ Removed: ${removedLink}`);
      } else {
        console.log("❌ Invalid link number");
      }
    } catch (error) {
      console.error(`Error removing CTA link: ${error.message}`);
    }
  }

  async clearCTALinks(accountId) {
    try {
      const ctaPath = path.join(this.accountsDir, accountId, "cta_link.txt");
      await fs.writeFile(ctaPath, "");
      console.log(`✅ Cleared all CTA links for ${accountId}`);
    } catch (error) {
      console.error(`Error clearing CTA links: ${error.message}`);
    }
  }

  async importCTALinks(accountId, sourceFile) {
    try {
      const sourceData = await fs.readFile(sourceFile, "utf8");
      const links = sourceData.split("\n")
        .map(line => line.trim())
        .filter(line => line && 
                line.startsWith("http") && 
                !line.startsWith("#"));
      
      if (links.length === 0) {
        console.log("❌ No valid links found in source file");
        return;
      }

      const ctaPath = path.join(this.accountsDir, accountId, "cta_link.txt");
      const content = links.join("\n");
      await fs.writeFile(ctaPath, content);
      
      console.log(`✅ Imported ${links.length} CTA links for ${accountId}`);
    } catch (error) {
      console.error(`Error importing CTA links: ${error.message}`);
    }
  }

  async close() {
    this.rl.close();
  }
}

async function main() {
  const manager = new CTAManager();
  
  try {
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║  CTA LINK MANAGER                                        ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    
    const accountId = await manager.question("Enter account ID: ");
    const action = await manager.question("\nAction (list/add/remove/clear/import): ");
    
    switch (action.toLowerCase()) {
      case 'list':
        await manager.listCTALinks(accountId);
        break;
        
      case 'add':
        await manager.addCTALink(accountId);
        break;
        
      case 'remove':
        await manager.removeCTALink(accountId);
        break;
        
      case 'clear':
        await manager.clearCTALinks(accountId);
        break;
        
      case 'import':
        const sourceFile = await manager.question("Enter source file path: ");
        await manager.importCTALinks(accountId, sourceFile);
        break;
        
      default:
        console.log("❌ Invalid action");
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await manager.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = CTAManager;

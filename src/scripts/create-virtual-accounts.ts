/**
 * Migration script to create virtual accounts for existing agents and landlords
 * Run this script once to backfill virtual accounts for existing users
 * 
 * Usage: 
 * - Add to package.json: "create-virtual-accounts": "ts-node src/scripts/create-virtual-accounts.ts"
 * - Run: npm run create-virtual-accounts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { FlutterwaveService } from '../promotions/flutterwave.service';
import { UserRole } from '../users/schemas/user.schema';

async function createVirtualAccounts() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const flutterwaveService = app.get(FlutterwaveService);

  try {
    // Get all agents and landlords
    const users = await usersService.findAll();
    const agentsAndLandlords = users.filter(
      (user: any) => user.role === UserRole.Agent || user.role === UserRole.Landlord
    );

    console.log(`Found ${agentsAndLandlords.length} agents/landlords to process`);

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ email: string; error: string }> = [];

    for (const user of agentsAndLandlords) {
      try {
        // Check if wallet already exists
        const existingWallet = await flutterwaveService.getWalletByEmail(user.email);
        if (existingWallet && existingWallet.customerCode) {
          console.log(`✓ Virtual account already exists for ${user.email}`);
          successCount++;
          continue;
        }

        // Create virtual account
        await flutterwaveService.createVirtualAccount({
          account_name: user.name,
          email: user.email,
          mobilenumber: user.phone || '08000000000',
        });

        console.log(`✓ Created virtual account for ${user.email}`);
        successCount++;
      } catch (error: any) {
        console.error(`✗ Failed to create virtual account for ${user.email}:`, error.message || error);
        errorCount++;
        errors.push({
          email: user.email,
          error: error.message || String(error),
        });
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total processed: ${agentsAndLandlords.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${errorCount}`);

    if (errors.length > 0) {
      console.log('\n=== Errors ===');
      errors.forEach(({ email, error }) => {
        console.log(`${email}: ${error}`);
      });
    }

    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    await app.close();
    process.exit(1);
  }
}

createVirtualAccounts();


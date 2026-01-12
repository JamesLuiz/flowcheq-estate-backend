import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Wallet, WalletDocument } from '../users/schemas/wallet.schema';
import axios from 'axios';
import { Logger } from '@nestjs/common';

async function updateWalletSubaccountIds() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const walletModel = app.get<Model<WalletDocument>>(getModelToken(Wallet.name));
  const logger = new Logger('UpdateSubaccountIds');

  try {
    logger.log('Starting subaccount ID update script...');

    // Get all wallets that don't have subaccountId
    const wallets = await walletModel.find({ 
      $or: [
        { subaccountId: { $exists: false } },
        { subaccountId: null },
        { subaccountId: '' }
      ],
      customerCode: { $exists: true, $ne: null }
    }).exec();

    logger.log(`Found ${wallets.length} wallets to update`);

    let updated = 0;
    let failed = 0;

    for (const wallet of wallets) {
      try {
        if (!wallet.customerCode) {
          logger.warn(`Skipping wallet for ${wallet.email}: no customerCode`);
          continue;
        }

        // Fetch subaccount details from Flutterwave
        const headers = {
          accept: 'application/json',
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json',
        };

        const response = await axios.get(
          `https://api.flutterwave.com/v3/payout-subaccounts/${wallet.customerCode}`,
          { headers }
        );

        if (response.data?.data?.id) {
          wallet.subaccountId = response.data.data.id;
          await wallet.save();
          logger.log(`✓ Updated wallet for ${wallet.email}: subaccountId = ${response.data.data.id}`);
          updated++;
        } else {
          logger.warn(`✗ No subaccount ID found for ${wallet.email}`);
          failed++;
        }
      } catch (error: any) {
        logger.error(`✗ Failed to update wallet for ${wallet.email}: ${error.message || error}`);
        failed++;
      }
    }

    logger.log('\n=== Summary ===');
    logger.log(`Total processed: ${wallets.length}`);
    logger.log(`Updated: ${updated}`);
    logger.log(`Failed: ${failed}`);

    await app.close();
    process.exit(0);
  } catch (error) {
    logger.error('Fatal error:', error);
    await app.close();
    process.exit(1);
  }
}

updateWalletSubaccountIds();


import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Logger } from '@nestjs/common';
import { Wallet, WalletDocument } from '../users/schemas/wallet.schema';

async function createSplitSubaccounts() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const walletModel = app.get<Model<WalletDocument>>(getModelToken(Wallet.name));
  const logger = new Logger('CreateSplitSubaccounts');

  try {
    logger.log('Starting split subaccount creation script...');

    const wallets = await walletModel.find({
      $and: [
        { customerCode: { $exists: true, $ne: null } },
        { $or: [{ subaccountId: { $exists: false } }, { subaccountId: null }, { subaccountId: '' }] },
      ],
    }).exec();

    logger.log(`Found ${wallets.length} wallets that may need split subaccount IDs`);

    const headers = {
      accept: 'application/json',
      Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };

    let updated = 0;
    let failed = 0;

    for (const wallet of wallets) {
      try {
        const acctNumber = wallet.accountNumber;
        const acctBank = wallet.bankCode;
        const businessName = wallet.accountName || wallet.userID?.toString() || wallet.email;
        const businessEmail = wallet.email;

        if (!acctNumber || !acctBank) {
          logger.warn(`Skipping ${wallet.email}: missing account number or bank code`);
          failed++;
          continue;
        }

        const payload = {
          account_bank: acctBank,
          account_number: acctNumber,
          business_name: businessName,
          business_email: businessEmail,
          country: 'NG',
        };

        try {
          const resp = await axios.post('https://api.flutterwave.com/v3/subaccounts', payload, { headers });
          const id = resp?.data?.data?.id;
          if (id) {
            wallet.subaccountId = id;
            await wallet.save();
            logger.log(`✓ Created subaccount for ${wallet.email}: ${id}`);
            updated++;
          } else {
            logger.warn(`✗ No id returned when creating subaccount for ${wallet.email}`);
            failed++;
          }
        } catch (err: any) {
          logger.error(`✗ Failed to create/fetch subaccount for ${wallet.email}: ${err.response?.data || err.message || err}`);
          failed++;
        }
      } catch (err) {
        logger.error(`Unexpected error processing wallet ${wallet.email}: ${err}`);
        failed++;
      }
    }

    logger.log('\n=== Summary ===');
    logger.log(`Processed: ${wallets.length}`);
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

createSplitSubaccounts();

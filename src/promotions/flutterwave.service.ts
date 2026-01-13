import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import * as crypto from 'crypto';
import { Wallet, WalletDocument } from '../users/schemas/wallet.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);
  private readonly secretKey: string;
  private readonly secretHash: string;
  private readonly baseUrl = 'https://api.flutterwave.com/v3';
  private readonly headers: any;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    this.secretKey = this.configService.get<string>('FLUTTERWAVE_SECRET_KEY') || '';
    // Encryption key is only needed for webhook verification (optional if not using webhooks)
    this.secretHash = this.configService.get<string>('FLUTTERWAVE_ENCRYPTION_KEY') || '';
    this.headers = {
      accept: 'application/json',
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async initializePayment(data: {
    amount: number;
    email: string;
    name: string;
    phone?: string;
    tx_ref: string;
    callback_url: string;
    meta?: Record<string, any>;
    customizations?: {
      title?: string;
      description?: string;
      logo?: string;
    };
    subaccounts?: Array<{
      id: string; // subaccount ID (e.g., RS_xxx) - NOT account_reference
      transaction_charge_type: 'percentage' | 'flat' | 'flat_subaccount'; // Split type
      transaction_charge: number; // Platform commission: decimal for percentage (0.1 = 10%), or flat amount in currency
    }>;
  }) {
    try {
      // Default customizations for promotions
      const defaultCustomizations = {
        title: 'House Me - Property Promotion',
        description: `Promote property for ${data.amount} Naira`,
        logo: 'https://house-me.vercel.app/logo.png',
      };

      // Use provided customizations or defaults
      const customizations = data.customizations || defaultCustomizations;

      const paymentData: any = {
        tx_ref: data.tx_ref,
        amount: data.amount,
        currency: 'NGN',
        redirect_url: data.callback_url,
        payment_options: 'card,banktransfer,ussd',
        customer: {
          email: data.email,
          name: data.name,
          phonenumber: data.phone || '',
        },
        customizations: {
          title: customizations.title || defaultCustomizations.title,
          description: customizations.description || defaultCustomizations.description,
          logo: customizations.logo || defaultCustomizations.logo,
        },
        meta: data.meta || {},
      };

      // Add subaccounts for split payment (if provided)
      if (data.subaccounts && data.subaccounts.length > 0) {
        // Flutterwave split payment format:
        // For percentage: split_type = 'percentage', split_value = whole number (90 = 90% to subaccount, 10% to platform)
        // For flat: split_type = 'flat', split_value = amount
        paymentData.subaccounts = data.subaccounts.map((s: any) => {
          const mapped: any = {
            id: s.id, // Split payment subaccount ID (RS_xxx)
          };
          
          // Map transaction_charge_type to split_type
          if (s.transaction_charge_type === 'percentage') {
            mapped.split_type = 'percentage';
            // transaction_charge is the percentage going to the SUBACCOUNT (agent) as whole number (90 = 90%)
            // split_value should be the same whole number
            mapped.split_value = s.transaction_charge;
          } else if (s.transaction_charge_type === 'flat') {
            mapped.split_type = 'flat';
            mapped.split_value = s.transaction_charge; // Flat amount in currency
          } else if (s.transaction_charge_type === 'flat_subaccount') {
            mapped.split_type = 'flat_subaccount';
            mapped.split_value = s.transaction_charge;
          } else {
            // Fallback: use as-is if already in Flutterwave format
            mapped.split_type = s.split_type || s.transaction_charge_type || 'percentage';
            mapped.split_value = s.split_value || s.transaction_charge;
          }
          
          return mapped;
        });
        this.logger.log('Initializing Flutterwave payment with split payment subaccounts:', JSON.stringify(paymentData.subaccounts));
      }

      const response = await axios.post(
        `${this.baseUrl}/payments`,
        paymentData,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        success: true,
        paymentLink: response.data.data.link,
        transactionId: response.data.data.id, // This is the Flutterwave transaction ID
        txRef: data.tx_ref, // Your reference
      };
    } catch (error: any) {
      this.logger.error('Flutterwave payment initialization error:', error.response?.data || error.message);
      throw new Error('Failed to initialize payment');
    }
  }

  // Verify by transaction ID
  async verifyPayment(transactionId: string | number) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transactions/${transactionId}/verify`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      const transaction = response.data.data;
      return {
        success: transaction.status === 'successful',
        amount: transaction.amount,
        currency: transaction.currency,
        txRef: transaction.tx_ref,
        status: transaction.status,
        customer: transaction.customer,
        paymentType: transaction.payment_type,
      };
    } catch (error: any) {
      this.logger.error('Flutterwave payment verification error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Payment verification failed',
      };
    }
  }

  // Verify by your tx_ref
  async verifyPaymentByReference(txRef: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transactions/verify_by_reference`,
        {
          params: { tx_ref: txRef },
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      const transaction = response.data.data;
      return {
        success: transaction.status === 'successful',
        data: transaction, // Include full transaction data for access to meta, amount, etc.
        amount: transaction.amount,
        currency: transaction.currency,
        txRef: transaction.tx_ref,
        status: transaction.status,
        customer: transaction.customer,
        id: transaction.id,
      };
    } catch (error: any) {
      this.logger.error('Flutterwave payment verification error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Payment verification failed',
      };
    }
  }

  async verifyWebhook(secretHash: string, payload: any, signature: string): Promise<boolean> {
    const hash = crypto
      .createHmac('sha256', secretHash)
      .update(JSON.stringify(payload))
      .digest('hex');

    return hash === signature;
  }

  async initiateTransfer(data: {
    account_bank: string;
    account_number: string;
    amount: number;
    narration: string;
    currency?: string;
    beneficiary_name?: string;
    reference?: string;
    callback_url?: string; // Optional webhook URL for this transfer
    debit_currency?: string; // Currency to debit from wallet
  }) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/transfers`,
        {
          account_bank: data.account_bank,
          account_number: data.account_number,
          amount: data.amount,
          narration: data.narration,
          currency: data.currency || 'NGN',
          beneficiary_name: data.beneficiary_name,
          reference: data.reference || `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          callback_url: data.callback_url,
          debit_currency: data.debit_currency,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        success: true,
        transferId: response.data.data.id,
        reference: response.data.data.reference,
        status: response.data.data.status,
        amount: response.data.data.amount,
      };
    } catch (error: any) {
      this.logger.error('Flutterwave transfer initiation error:', error.response?.data || error.message);
      throw new Error(`Failed to initiate transfer: ${error.response?.data?.message || error.message}`);
    }
  }

  async verifyTransfer(transferId: number) { // Should be number, not string
    try {
      const response = await axios.get(
        `${this.baseUrl}/transfers/${transferId}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      const transfer = response.data.data;
      return {
        success: transfer.status === 'SUCCESSFUL',
        status: transfer.status,
        amount: transfer.amount,
        reference: transfer.reference,
        complete_message: transfer.complete_message,
        created_at: transfer.created_at,
        bankName: transfer.bank_name,
        accountNumber: transfer.account_number,
      };
    } catch (error: any) {
      this.logger.error('Flutterwave transfer verification error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Transfer verification failed',
      };
    }
  }

  // Create virtual account for user
  async createVirtualAccount(data: {
    account_name: string;
    email: string;
    mobilenumber: string;
  }): Promise<any> {
    let { account_name, email = '', mobilenumber } = data;
    email = email.toLowerCase();
    
    try {
      // Check if wallet already exists
      const existingWallet = await this.walletModel.findOne({ email });
      if (existingWallet && existingWallet.customerCode) {
        this.logger.log(`Virtual account already exists for ${email}`);
        return {
          nuban: existingWallet.accountNumber,
          account_name: existingWallet.accountName,
          barter_id: existingWallet.barter_id,
          bank_name: existingWallet.bankName,
          bank_code: existingWallet.bankCode,
          account_reference: existingWallet.customerCode,
          id: existingWallet.subaccountId, // Return subaccount ID
        };
      }

      // Check if subaccount exists in Flutterwave
      let check = true;
      let next_cursor = '';
      const payout_subaccounts: any[] = [];
      
      while (check) {
        const response = await axios.request({
          method: 'GET',
          url: `https://api.flutterwave.com/v3/payout-subaccounts?limit=20${next_cursor ? `&next_cursor=${next_cursor}` : ''}`,
          headers: this.headers,
        });
        
        if (response.data.data?.cursor) {
          next_cursor = response.data.data.cursor.next || '';
          check = response.data.data.cursor.has_more_items || false;
        } else {
          check = false;
        }
        
        if (response.data.data?.payout_subaccounts && Array.isArray(response.data.data.payout_subaccounts)) {
          payout_subaccounts.push(...response.data.data.payout_subaccounts);
        }
      }

      let responseType: any = payout_subaccounts.find(
        (sub: any) => sub.email?.toLowerCase() === email.toLowerCase()
      );
      
      // If found existing subaccount, ensure we have the ID
      if (responseType && !responseType.id && responseType.account_reference) {
        // Try to get the full subaccount details including ID
        try {
          const subaccountResponse = await axios.request({
            method: 'GET',
            url: `https://api.flutterwave.com/v3/payout-subaccounts/${responseType.account_reference}`,
            headers: this.headers,
          });
          if (subaccountResponse.data?.data?.id) {
            responseType.id = subaccountResponse.data.data.id;
          }
        } catch (error) {
          this.logger.warn(`Could not fetch subaccount ID for ${email}`);
        }
      }

      if (!responseType) {
        // Create new subaccount
        const options = {
          method: 'POST',
          url: 'https://api.flutterwave.com/v3/payout-subaccounts',
          headers: this.headers,
          data: {
            account_name,
            email,
            mobilenumber,
            country: 'NG',
          },
        };
        const response = await axios.request(options);
        responseType = response.data.data;
      }

      // Attempt to ensure we have a proper "subaccount" id for split payments
      // Flutterwave uses /v3/subaccounts (IDs like RS_xxx) for split payments.
      // The payout-subaccounts resource (used above) creates virtual accounts, but
      // may not automatically expose the subaccount id used by the split payments API.
      // We'll try to create (or fetch) a subaccount using the bank details we have
      // and persist its id as `subaccountId` on the wallet.
      try {
        // Prepare values that might exist on the payout-subaccount response
        const acctNumber = responseType.nuban || responseType.account_number || responseType.accountNumber;
        const acctBank = responseType.bank_code || responseType.bankCode || responseType.bank;

        if (acctNumber && acctBank) {
          const subaccountPayload: any = {
            account_bank: acctBank,
            account_number: acctNumber,
            business_name: account_name,
            business_email: email,
            country: 'NG',
          };

          // Try to create a split-capable subaccount. If it already exists, the API
          // may return an error which we catch and log; we won't fail the whole flow.
          try {
            const subResp = await axios.request({
              method: 'POST',
              url: 'https://api.flutterwave.com/v3/subaccounts',
              headers: this.headers,
              data: subaccountPayload,
            });

            // CRITICAL: Use subaccount_id (RS_xxx) for split payments, NOT id (numeric)
            // If creation succeeded and returned a subaccount_id, attach it to responseType
            const subaccountId = subResp?.data?.data?.subaccount_id;
            if (subaccountId) {
              responseType.id = String(subaccountId).trim(); // Store RS_xxx format
            } else if (subResp?.data?.data?.id) {
              // Fallback: log warning if only numeric id is available
              this.logger.warn(`Subaccount created but no subaccount_id. Got numeric id: ${subResp.data.data.id}. Split payments may not work.`);
            }
          } catch (subErr: any) {
            // If creating the subaccount fails (for example because it already exists),
            // try to fetch it by account number via the payout-subaccounts endpoint
            // (best-effort). Log details so maintainers can inspect.
            this.logger.warn('Could not create subaccount for split payments:', subErr.response?.data || subErr.message || subErr);
          }
        } else {
          this.logger.warn('Insufficient bank details from payout-subaccount to create subaccount for split payments');
        }
      } catch (err) {
        this.logger.warn('Unexpected error while ensuring subaccount for split payments:', err?.message || err);
      }

      // Find or create user
      const user = await this.userModel.findOne({ email });
      if (!user) {
        throw new Error('User not found');
      }

      if (!responseType) {
        throw new Error('Failed to create or find virtual account');
      }

      // Save wallet information
      // Ensure subaccountId is a string if it exists
      const subaccountId = responseType.id ? String(responseType.id).trim() : undefined;
      
      const walletData = {
        accountNumber: responseType.nuban,
        accountName: account_name,
        email: email,
        userID: user._id,
        barter_id: responseType.barter_id,
        bankCode: responseType.bank_code,
        bankName: responseType.bank_name,
        customerCode: responseType.account_reference,
        subaccountId: subaccountId, // Store the subaccount ID for split payments (ensure it's a string)
        currency: 'NGN',
        status: responseType.status || 'ACTIVE',
      };

      await this.walletModel.findOneAndUpdate(
        { email },
        walletData,
        { upsert: true, new: true }
      );

      this.logger.log(`Virtual account created for ${email}: ${responseType.nuban}`);
      return responseType;
    } catch (error: any) {
      this.logger.error('Error creating virtual account:', error.response?.data || error.message);
      
      // If account already exists, try to fetch from database
      if (error.response?.data?.message?.toLowerCase().includes('exist')) {
        const user = await this.userModel.findOne({ email });
        const wallet = await this.walletModel.findOne({ email, userID: user?._id.toString() });
        if (wallet) {
          return {
            nuban: wallet.accountNumber,
            account_name: wallet.accountName,
            barter_id: wallet.barter_id,
            bank_name: wallet.bankName,
            bank_code: wallet.bankCode,
            account_reference: wallet.customerCode,
          };
        }
      }
      
      throw error.response?.data || error;
    }
  }

  // Get available balance from virtual account
  async getAvailableBalance(userID: string): Promise<any> {
    try {
      const wallet = await this.getWalletByUserId(userID);
      if (!wallet || !wallet.customerCode) {
        throw new Error('Wallet not found or virtual account not created');
      }

      const options = {
        method: 'GET',
        url: `https://api.flutterwave.com/v3/payout-subaccounts/${wallet.customerCode}/balances`,
        headers: this.headers,
      };
      const response = await axios.request(options);
      
      // Return balance data with wallet info
      return { 
        data: { 
          available_balance: response.data.data?.available_balance || 0,
          ledger_balance: response.data.data?.ledger_balance || 0,
          currency: response.data.data?.currency || 'NGN',
          wallet 
        } 
      };
    } catch (error: any) {
      this.logger.error('Error fetching available balance:', error.response?.data || error.message);
      throw error.response?.data || error;
    }
  }

  // Withdraw funds from virtual account to bank account
  async withdrawFundsFromVirtualAccount(data: {
    account_bank: string;
    account_number: string;
    amount: number;
    narration?: string;
    reference?: string;
    debit_subaccount?: string;
  }): Promise<any> {
    const {
      account_bank,
      account_number,
      amount,
      narration,
      reference,
      debit_subaccount,
    } = data;

    try {
      const options = {
        method: 'POST',
        url: 'https://api.flutterwave.com/v3/transfers',
        headers: this.headers,
        data: {
          account_bank,
          account_number,
          amount,
          currency: 'NGN',
          narration,
          reference: reference || `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          debit_subaccount,
          callback_url: process.env.FLUTTERWAVE_WEBHOOK_URL || 'https://www.flutterwave.com/ng/',
          debit_currency: 'NGN',
        },
      };
      const response = await axios.request(options);
      return response.data;
    } catch (error: any) {
      this.logger.error('Error withdrawing funds from virtual account:', error.response?.data || error.message);
      throw error.response?.data || error;
    }
  }

  // Fund virtual account - Transfer from platform account to virtual account
  // Uses transfers API to transfer to the virtual account's bank account number
  async fundVirtualAccount(data: {
    account_reference: string;
    amount: number;
  }): Promise<any> {
    const { account_reference, amount } = data;
    try {
      // Get wallet details to get bank account number and bank code
      const wallet = await this.walletModel.findOne({ customerCode: account_reference }).exec();
      
      if (!wallet || !wallet.accountNumber || !wallet.bankCode) {
        throw new Error(`Virtual account not found or missing bank details for account_reference: ${account_reference}`);
      }

      // Use transfers API to transfer to the virtual account's bank account
      const options = {
        method: 'POST',
        url: 'https://api.flutterwave.com/v3/transfers',
        headers: this.headers,
        data: {
          account_bank: wallet.bankCode,
          account_number: wallet.accountNumber,
          amount,
          currency: 'NGN',
          narration: `Fund virtual account - ${wallet.accountName || 'Virtual Account'}`,
          reference: `FUND-VA-${account_reference}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          beneficiary_name: wallet.accountName || 'Virtual Account',
          callback_url: process.env.FLUTTERWAVE_WEBHOOK_URL || 'https://www.flutterwave.com/ng/',
          debit_currency: 'NGN',
          // No debit_subaccount - this debits from main platform account
        },
      };
      const response = await axios.request(options);
      this.logger.log(`Transfer initiated to fund virtual account ${account_reference}: ₦${amount}`);
      return response.data;
    } catch (error: any) {
      this.logger.error('Error funding virtual account:', error.response?.data || error.message);
      throw error.response?.data || error;
    }
  }

  // Get wallet by user ID
  async getWalletByUserId(userID: string): Promise<WalletDocument | null> {
    try {
      return this.walletModel.findOne({ userID: new Types.ObjectId(userID) }).exec();
    } catch (error: any) {
      this.logger.error(`Error finding wallet for userID ${userID}:`, error.message || error);
      return null;
    }
  }

  // Get wallet by email
  async getWalletByEmail(email: string): Promise<WalletDocument | null> {
    return this.walletModel.findOne({ email: email.toLowerCase() }).exec();
  }

  // Fetch existing subaccounts from Flutterwave
  async fetchExistingSubaccounts(): Promise<any[]> {
    try {
      const allSubaccounts: any[] = [];
      let page = 1;
      let hasMore = true;
      const maxPages = 10; // Safety limit to prevent infinite loops

      while (hasMore && page <= maxPages) {
        try {
          const response = await axios.get(
            `${this.baseUrl}/subaccounts`,
            { 
              headers: this.headers,
              params: { page }
            }
          );

          // Flutterwave API response structure may vary
          const subaccounts = response.data?.data || response.data || [];
          
          if (Array.isArray(subaccounts) && subaccounts.length > 0) {
            allSubaccounts.push(...subaccounts);
            
            // Check pagination - Flutterwave may use different pagination structures
            const meta = response.data?.meta;
            if (meta) {
              // Try different pagination formats
              if (meta.page_info && page < meta.page_info.total_pages) {
                page++;
              } else if (meta.current_page && meta.total_pages && page < meta.total_pages) {
                page++;
              } else if (subaccounts.length < 20) { // If less than typical page size, probably last page
                hasMore = false;
              } else {
                page++;
              }
            } else if (subaccounts.length < 20) {
              // If no meta and less than typical page size, assume last page
              hasMore = false;
            } else {
              page++;
            }
          } else {
            hasMore = false;
          }
        } catch (pageError: any) {
          // If page fetch fails, log and stop
          this.logger.warn(`Error fetching subaccounts page ${page}:`, pageError.response?.data?.message || pageError.message);
          hasMore = false;
        }
      }

      this.logger.log(`Fetched ${allSubaccounts.length} existing subaccounts from Flutterwave`);
      return allSubaccounts;
    } catch (error: any) {
      this.logger.error('Error fetching existing subaccounts:', error.response?.data || error.message);
      return [];
    }
  }

  // Find existing subaccount by account number and bank code
  async findExistingSubaccount(account_bank: string, account_number: string): Promise<string | null> {
    try {
      const subaccounts = await this.fetchExistingSubaccounts();
      
      if (subaccounts.length === 0) {
        this.logger.log(`No existing subaccounts found in Flutterwave`);
        return null;
      }
      
      // Find subaccount matching account number and bank code
      // Flutterwave may return account_number and account_bank in different formats
      const matchingSubaccount = subaccounts.find(
        (sub: any) => {
          const subAccountNumber = String(sub.account_number || sub.accountNumber || '').trim();
          const subAccountBank = String(sub.account_bank || sub.accountBank || '').trim();
          const searchAccountNumber = String(account_number).trim();
          const searchAccountBank = String(account_bank).trim();
          
          return subAccountNumber === searchAccountNumber && subAccountBank === searchAccountBank;
        }
      );

      // CRITICAL: Use subaccount_id (RS_xxx) for split payments, NOT id (numeric)
      if (matchingSubaccount?.subaccount_id) {
        const idString = String(matchingSubaccount.subaccount_id).trim();
        this.logger.log(`Found existing subaccount ${idString} for account ${account_number} (bank: ${account_bank})`);
        return idString;
      }
      
      // Fallback: Check if id exists but log warning
      if (matchingSubaccount?.id) {
        this.logger.warn(`Found subaccount with numeric id ${matchingSubaccount.id} but no subaccount_id. This may not work for split payments.`);
      }

      this.logger.log(`No matching subaccount found for account ${account_number} (bank: ${account_bank})`);
      return null;
    } catch (error: any) {
      this.logger.warn(`Error finding existing subaccount:`, error.message || error);
      return null;
    }
  }

  // Create or get split payment subaccount for an agent
  // This is used for automatic payment splitting (different from payout subaccounts)
  async createOrGetSplitPaymentSubaccount(data: {
    account_bank: string; // Bank code (e.g., "044" for Access Bank)
    account_number: string; // Agent's bank account number
    business_name: string; // Agent's name or business name
    business_email: string; // Agent's email
    business_mobile?: string; // Agent's phone number
  }): Promise<{ id: string; account_bank: string; account_number: string }> {
    const { account_bank, account_number, business_name, business_email, business_mobile } = data;

    try {
      // First, try to find existing subaccount
      const existingId = await this.findExistingSubaccount(account_bank, account_number);
      if (existingId) {
        this.logger.log(`Using existing split payment subaccount ${existingId} for ${business_email}`);
        return {
          id: existingId,
          account_bank,
          account_number,
        };
      }

      // If not found, try to create a new one
      try {
        const response = await axios.post(
          `${this.baseUrl}/subaccounts`,
          {
            account_bank,
            account_number,
            business_name,
            business_email,
            business_mobile: business_mobile || '',
            country: 'NG',
            // Note: split_type and split_value are set per transaction, not per subaccount
          },
          { headers: this.headers }
        );

        // CRITICAL: Flutterwave returns subaccount_id (RS_xxx) in response.data.data.subaccount_id
        // This is what we need for split payments, NOT the numeric id field
        const subaccountId = response.data?.data?.subaccount_id;
        if (subaccountId) {
          // Convert to string if it's not already
          const idString = String(subaccountId).trim();
          this.logger.log(`Created split payment subaccount ${idString} for ${business_email}`);
          return {
            id: idString,
            account_bank,
            account_number,
          };
        }
        
        // Log warning if we only have numeric id
        if (response.data?.data?.id) {
          this.logger.warn(`Subaccount created but no subaccount_id returned. Got numeric id: ${response.data.data.id}. Split payments may not work.`);
        }
      } catch (createError: any) {
        // If subaccount already exists, try to find it again
        if (createError.response?.data?.message?.toLowerCase().includes('exist') || 
            createError.response?.data?.message?.toLowerCase().includes('already')) {
          this.logger.log(`Subaccount creation failed (may already exist), searching for existing subaccount...`);
          
          // Try to find it one more time (in case it was just created)
          const foundId = await this.findExistingSubaccount(account_bank, account_number);
          if (foundId) {
            this.logger.log(`Found existing split payment subaccount ${foundId} for ${business_email}`);
            return {
              id: foundId,
              account_bank,
              account_number,
            };
          }
          
          // If still not found, throw error
          throw new Error(`Split payment subaccount may already exist but could not be retrieved. Please check Flutterwave dashboard.`);
        }
        throw createError;
      }

      throw new Error('Failed to create split payment subaccount: No ID returned');
    } catch (error: any) {
      this.logger.error('Error creating split payment subaccount:', error.response?.data || error.message);
      throw error.response?.data || error;
    }
  }

  // Ensure split payment subaccount exists for an agent (creates if doesn't exist)
  // Uses the agent's virtual account (NUBAN) so funds go to virtual account wallet
  // Agent can then withdraw to their bank account when they want
  async ensureSplitPaymentSubaccount(userId: string): Promise<string | null> {
    try {
      const wallet = await this.getWalletByUserId(userId);
      if (!wallet) {
        this.logger.warn(`No wallet found for user ${userId}, cannot create split payment subaccount`);
        return null;
      }

      // Check if virtual account has required details
      if (!wallet.accountNumber || !wallet.bankCode) {
        this.logger.warn(`Virtual account missing account number or bank code for user ${userId}`);
        return null;
      }

      // If split payment subaccount ID already exists, return it
      if (wallet.subaccountId && wallet.subaccountId.startsWith('RS_')) {
        this.logger.log(`Split payment subaccount already exists for user ${userId}: ${wallet.subaccountId}`);
        return wallet.subaccountId;
      }

      // Get user details
      const user = await this.userModel.findById(userId).exec();
      if (!user) {
        this.logger.warn(`User not found: ${userId}`);
        return null;
      }

      // Create split payment subaccount using agent's VIRTUAL ACCOUNT (NUBAN)
      // This way funds go to the virtual account wallet, not directly to bank account
      const subaccount = await this.createOrGetSplitPaymentSubaccount({
        account_bank: wallet.bankCode, // Virtual account's bank code
        account_number: wallet.accountNumber, // Virtual account's NUBAN
        business_name: wallet.accountName || user.name,
        business_email: user.email,
        business_mobile: user.phone || '',
      });

      // Ensure subaccount ID is a string before saving
      const subaccountIdString = String(subaccount.id || '').trim();
      if (!subaccountIdString) {
        throw new Error('Subaccount ID is empty or invalid');
      }

      // Update wallet with split payment subaccount ID
      wallet.subaccountId = subaccountIdString;
      await wallet.save();

      this.logger.log(`Created and saved split payment subaccount ${subaccountIdString} for user ${userId} using virtual account ${wallet.accountNumber}`);
      return subaccountIdString;
    } catch (error: any) {
      // If subaccount creation fails, log but don't throw (payment can still proceed without split)
      this.logger.error(`Failed to ensure split payment subaccount for user ${userId}:`, error.message || error);
      return null;
    }
  }

  // Transfer funds from virtual account to platform account (main Flutterwave account)
  // This transfers to a bank account linked to the main Flutterwave account
  // Note: Not used for viewing payments (commission stays in platform account automatically)
  // This method may be useful for other manual transfer scenarios
  async transferFromVirtualAccountToPlatform(data: {
    agentCustomerCode: string; // Agent's virtual account customer code
    amount: number;
    narration?: string;
    reference?: string;
  }): Promise<any> {
    const { agentCustomerCode, amount, narration, reference } = data;

    // Get platform bank account details from config
    const platformBankCode = this.configService.get<string>('PLATFORM_BANK_CODE');
    const platformAccountNumber = this.configService.get<string>('PLATFORM_ACCOUNT_NUMBER');
    const platformAccountName = this.configService.get<string>('PLATFORM_ACCOUNT_NAME') || 'Platform Account';

    if (!platformBankCode || !platformAccountNumber) {
      throw new Error('Platform bank account details not configured. Please set PLATFORM_BANK_CODE and PLATFORM_ACCOUNT_NUMBER environment variables.');
    }

    try {
      const options = {
        method: 'POST',
        url: 'https://api.flutterwave.com/v3/transfers',
        headers: this.headers,
        data: {
          account_bank: platformBankCode,
          account_number: platformAccountNumber,
          amount,
          currency: 'NGN',
          narration: narration || `Platform commission from agent virtual account`,
          reference: reference || `PLATFORM-COMM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          beneficiary_name: platformAccountName,
          debit_subaccount: agentCustomerCode, // Debit from agent's virtual account
          callback_url: process.env.FLUTTERWAVE_WEBHOOK_URL || 'https://www.flutterwave.com/ng/',
          debit_currency: 'NGN',
        },
      };
      const response = await axios.request(options);
      this.logger.log(`Transfer initiated: ₦${amount} from agent virtual account (${agentCustomerCode}) to platform account`);
      return response.data;
    } catch (error: any) {
      this.logger.error('Error transferring from virtual account to platform:', error.response?.data || error.message);
      throw error.response?.data || error;
    }
  }
}
import { Controller, Get, Post, Patch, Body, Param, Query, Res, UseGuards, NotFoundException, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { FlutterwaveService } from '../promotions/flutterwave.service';
import { WithdrawFundsDto } from './dto/withdraw-funds.dto';

@Controller('agents')
@ApiTags('Agents')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly flutterwaveService: FlutterwaveService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current agent profile' })
  @ApiResponse({ status: 200, description: 'Agent profile' })
  async getProfile(@CurrentUser() user: RequestUser) {
    const agent = await this.usersService.findById(user.sub);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return agent;
  }

  @Get()
  @ApiOperation({ summary: 'List agents' })
  @ApiResponse({ status: 200, description: 'List of agents' })
  async listAgents(
    @Query('limit') limit?: string,
    @Query('verified') verified?: string,
  ) {
    const filter: any = { role: { $in: ['agent', 'landlord'] } };
    if (verified !== undefined) {
      // Accept both 'true'/'false' strings
      filter.verified = String(verified) === 'true';
    }

    const opts: any = {};
    if (limit) {
      const n = parseInt(limit as string, 10);
      if (!isNaN(n) && n > 0) opts.limit = n;
    }

    const agents = await this.usersService.findAgents(filter, opts);
    return { data: agents.map((a) => this.usersService.toSafeUser(a)) };
  }

  @Get('me/bank-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get bank account details' })
  @ApiResponse({ status: 200, description: 'Bank account details' })
  async getBankAccount(@CurrentUser() user: RequestUser) {
    const agent = await this.usersService.findById(user.sub);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    if (agent.role !== 'agent' && agent.role !== 'landlord') {
      throw new ForbiddenException('Only agents and landlords can access bank account');
    }

    type VirtualAccountInfo = {
      accountNumber?: string;
      accountName?: string;
      bankName?: string;
      bankCode?: string;
      status?: string;
    };

    let virtualAccount: VirtualAccountInfo | null = null;
    let walletBalance = 0;
    
    try {
      const wallet = await this.flutterwaveService.getWalletByUserId(user.sub);
      if (wallet) {
        virtualAccount = {
          accountNumber: wallet.accountNumber,
          accountName: wallet.accountName,
          bankName: wallet.bankName,
          bankCode: wallet.bankCode,
          status: wallet.status,
        };
        
        // Get actual balance from Flutterwave virtual account
        try {
          const balanceData = await this.flutterwaveService.getAvailableBalance(user.sub);
          walletBalance = balanceData.data?.available_balance || balanceData.data?.ledger_balance || 0;
          
          // Sync local balance with Flutterwave balance (for caching)
          if (walletBalance !== ((agent as any).walletBalance || 0)) {
            await this.usersService.updateWalletBalance(user.sub, walletBalance);
          }
        } catch (balanceError: any) {
          // If Flutterwave balance fetch fails, use local balance as fallback
          walletBalance = (agent as any).walletBalance || 0;
          console.warn('Could not fetch Flutterwave balance, using local balance:', balanceError.message);
        }
      } else {
        // No virtual account, use local balance
        walletBalance = (agent as any).walletBalance || 0;
      }
    } catch (error) {
      console.log('Virtual account not found for user:', user.sub);
      walletBalance = (agent as any).walletBalance || 0;
    }

    return {
      bankAccount: (agent as any).bankAccount || null,
      walletBalance, // Actual balance from Flutterwave virtual account
      virtualAccount,
    };
  }

  @Patch('me/bank-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update bank account details' })
  @ApiResponse({ status: 200, description: 'Bank account updated' })
  async updateBankAccount(
    @CurrentUser() user: RequestUser,
    @Body() body: { bankAccount: { bankName: string; accountNumber: string; accountName: string; bankCode: string } },
  ) {
    const agent = await this.usersService.findById(user.sub);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    if (agent.role !== 'agent' && agent.role !== 'landlord') {
      throw new ForbiddenException('Only agents and landlords can update bank account');
    }

    return this.usersService.updateBankAccount(user.sub, body.bankAccount);
  }

  @Post('me/withdraw/request-otp')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Request OTP for withdrawal (after PIN verification)' })
  @ApiResponse({ status: 200, description: 'OTP sent to email' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async requestWithdrawalOtp(@CurrentUser() user: RequestUser) {
    const agent = await this.usersService.findById(user.sub);
    if (!agent) {
      throw new NotFoundException('User not found');
    }

    if (agent.role !== 'agent' && agent.role !== 'landlord') {
      throw new ForbiddenException('Only agents and landlords can withdraw funds');
    }

    const result = await this.usersService.generateWithdrawalOtp(user.sub);
    return {
      success: true,
      message: 'OTP sent to your email. It will expire in 1 minute and 50 seconds.',
      expiresAt: result.expiresAt,
    };
  }

  @Post('me/withdraw')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Withdraw funds from wallet to bank account' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          minimum: 100,
          example: 1000,
          description: 'Amount to withdraw (minimum 100 NGN)',
        },
        transactionPin: {
          type: 'string',
          minLength: 6,
          maxLength: 6,
          example: '123456',
          description: '6-digit transaction PIN',
        },
        otp: {
          type: 'string',
          minLength: 6,
          maxLength: 6,
          example: 'A1B2C3',
          description: '6-character alphanumeric OTP sent to email',
        },
      },
      required: ['amount', 'transactionPin', 'otp'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Withdrawal initiated successfully',
    schema: {
      example: {
        success: true,
        transferId: '123456',
        reference: 'TRF-1234567890-abc',
        status: 'NEW',
        amount: 1000,
        message: 'Withdrawal request submitted successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - insufficient balance or invalid amount' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - bank account not configured' })
  async withdrawFunds(
    @CurrentUser() user: RequestUser,
    @Body() body: WithdrawFundsDto,
  ) {
    // Log received data for debugging
    console.log('Withdrawal request received:', {
      userId: user.sub,
      amount: body.amount,
      amountType: typeof body.amount,
      transactionPin: body.transactionPin ? `${body.transactionPin.substring(0, 2)}****` : 'missing',
      transactionPinLength: body.transactionPin?.length,
    });
    
    const agent = await this.usersService.findById(user.sub);
    if (!agent) {
      throw new NotFoundException('User not found');
    }

    if (agent.role !== 'agent' && agent.role !== 'landlord') {
      throw new ForbiddenException('Only agents and landlords can withdraw funds');
    }

    const bankAccount = (agent as any).bankAccount;
    if (!bankAccount || !bankAccount.accountNumber || !bankAccount.bankCode) {
      throw new ForbiddenException('Bank account not configured. Please set up your bank account first.');
    }

    // Note: Balance check is now done after fetching from Flutterwave (see below)

    if (body.amount < 100) {
      throw new BadRequestException('Minimum withdrawal amount is 100 NGN');
    }

    // Verify transaction PIN
    if (!body.transactionPin) {
      throw new BadRequestException('Transaction PIN is required');
    }

    // Check if PIN is set
    const hasPin = await this.usersService.hasTransactionPin(user.sub);
    if (!hasPin) {
      throw new BadRequestException('Transaction PIN not set. Please set your transaction PIN first.');
    }

    // Validate PIN format
    if (!/^\d{6}$/.test(body.transactionPin)) {
      throw new BadRequestException('Transaction PIN must be exactly 6 digits');
    }

    const pinVerification = await this.usersService.verifyTransactionPin(user.sub, body.transactionPin);
    if (!pinVerification.valid) {
      throw new UnauthorizedException(
        `Invalid transaction PIN. ${pinVerification.attemptsRemaining} attempt(s) remaining.`
      );
    }

    // Verify OTP
    if (!body.otp) {
      throw new BadRequestException('OTP is required. Please request an OTP first.');
    }

    // Validate OTP format (6 alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/.test(body.otp.toUpperCase())) {
      throw new BadRequestException('OTP must be exactly 6 alphanumeric characters');
    }

    const otpVerification = await this.usersService.verifyWithdrawalOtp(user.sub, body.otp.toUpperCase());
    if (!otpVerification.valid) {
      throw new UnauthorizedException(otpVerification.message || 'Invalid or expired OTP. Please request a new one.');
    }

    try {
      const reference = `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Get user's virtual account wallet
      const wallet = await this.flutterwaveService.getWalletByUserId(user.sub);
      if (!wallet || !wallet.customerCode) {
        throw new BadRequestException('Virtual account not found. Please contact support.');
      }

      // Get actual balance from Flutterwave virtual account
      const balanceData = await this.flutterwaveService.getAvailableBalance(user.sub);
      const actualBalance = balanceData.data?.available_balance || balanceData.data?.ledger_balance || 0;
      
      // Verify sufficient balance in Flutterwave virtual account
      if (actualBalance < body.amount) {
        throw new BadRequestException(`Insufficient balance in virtual account. Available: ₦${actualBalance.toLocaleString()}`);
      }

      // Sync local balance with Flutterwave balance
      await this.usersService.updateWalletBalance(user.sub, actualBalance);

      // Try to withdraw from virtual account to bank account
      let transferResult: any = null;
      let transferId: string | undefined = undefined;
      let status = 'pending';
      
      try {
        transferResult = await this.flutterwaveService.withdrawFundsFromVirtualAccount({
        account_bank: bankAccount.bankCode,
        account_number: bankAccount.accountNumber,
        amount: body.amount,
        narration: `Withdrawal for ${agent.name}`,
        reference,
          debit_subaccount: wallet.customerCode, // Debit from user's virtual account
        });
        
        if (transferResult?.data?.id) {
          transferId = transferResult.data.id.toString();
          status = 'processing';
          
          // Sync balance after successful withdrawal
          try {
            const updatedBalanceData = await this.flutterwaveService.getAvailableBalance(user.sub);
            const updatedBalance = updatedBalanceData.data?.available_balance || updatedBalanceData.data?.ledger_balance || 0;
            await this.usersService.updateWalletBalance(user.sub, updatedBalance);
          } catch (syncError) {
            // If sync fails, deduct locally as fallback
            await this.usersService.deductFromWalletBalance(user.sub, body.amount);
          }
        }
      } catch (flutterwaveError: any) {
        // If Flutterwave transfer fails (e.g., IP whitelisting, API issues), 
        // mark withdrawal as pending for manual processing
        console.warn('Flutterwave withdrawal failed, marking withdrawal as pending:', flutterwaveError.message || flutterwaveError);
        status = 'pending';
        // Still deduct locally since we've verified the balance exists
        await this.usersService.deductFromWalletBalance(user.sub, body.amount);
      }

      // Create withdrawal record
      await this.usersService.createWithdrawal({
        userId: user.sub,
        amount: body.amount,
        bankName: bankAccount.bankName,
        accountNumber: bankAccount.accountNumber,
        accountName: bankAccount.accountName,
        bankCode: bankAccount.bankCode,
        reference: transferResult?.data?.reference || reference,
        transferId: transferId,
        status: status,
      });

      return {
        success: true,
        transferId: transferId || 'pending',
        reference: transferResult?.data?.reference || reference,
        status: status,
        amount: body.amount,
        message: status === 'processing' 
          ? 'Withdrawal request submitted successfully. Funds will be transferred to your bank account.'
          : 'Withdrawal request submitted. Your funds have been deducted from your wallet and will be processed manually.',
      };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to process withdrawal');
    }
  }

  @Post('me/transaction-pin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Set or update transaction PIN' })
  @ApiResponse({ status: 200, description: 'Transaction PIN set successfully' })
  @ApiResponse({ status: 400, description: 'Invalid PIN format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async setTransactionPin(
    @CurrentUser() user: RequestUser,
    @Body() body: { pin: string },
  ) {
    return this.usersService.setTransactionPin(user.sub, body.pin);
  }

  @Get('me/transaction-pin/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Check if transaction PIN is set' })
  @ApiResponse({ status: 200, description: 'PIN status' })
  async getTransactionPinStatus(@CurrentUser() user: RequestUser) {
    const hasPin = await this.usersService.hasTransactionPin(user.sub);
    return { hasPin };
  }

  @Post('me/transaction-pin/request-reset')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Request transaction PIN reset code via email' })
  @ApiResponse({ status: 200, description: 'Reset code sent to email' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async requestTransactionPinReset(@CurrentUser() user: RequestUser) {
    return this.usersService.requestTransactionPinReset(user.sub);
  }

  @Post('me/transaction-pin/reset')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Reset transaction PIN with code from email' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          example: '123456',
          description: '6-digit reset code from email',
        },
        newPin: {
          type: 'string',
          minLength: 6,
          maxLength: 6,
          example: '654321',
          description: 'New 6-digit transaction PIN',
        },
      },
      required: ['code', 'newPin'],
    },
  })
  @ApiResponse({ status: 200, description: 'PIN reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid code or PIN format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async resetTransactionPin(
    @CurrentUser() user: RequestUser,
    @Body() body: { code: string; newPin: string },
  ) {
    return this.usersService.resetTransactionPinWithCode(user.sub, body.code, body.newPin);
  }

  @Get('me/earnings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get earnings history' })
  @ApiResponse({ status: 200, description: 'Earnings list' })
  async getEarnings(@CurrentUser() user: RequestUser) {
    const [earnings, stats] = await Promise.all([
      this.usersService.getEarnings(user.sub),
      this.usersService.getEarningsStats(user.sub),
    ]);
    return { earnings, stats };
  }

  @Get('me/withdrawals')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get withdrawal history' })
  @ApiResponse({ status: 200, description: 'Withdrawals list' })
  async getWithdrawals(@CurrentUser() user: RequestUser) {
    const withdrawals = await this.usersService.getWithdrawals(user.sub);
    return { withdrawals };
  }

  @Post('me/fund-wallet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Initialize payment to fund virtual account' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          minimum: 100,
          example: 1000,
          description: 'Amount to fund (minimum 100 NGN)',
        },
      },
      required: ['amount'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Payment initialized successfully',
    schema: {
      example: {
        success: true,
        paymentLink: 'https://checkout.flutterwave.com/v3/hosted/pay/abc123',
        txRef: 'FUND-1234567890-abc',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid amount' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async fundWallet(
    @CurrentUser() user: RequestUser,
    @Body() body: { amount: number },
  ) {
    const agent = await this.usersService.findById(user.sub);
    if (!agent) {
      throw new NotFoundException('User not found');
    }

    if (agent.role !== 'agent' && agent.role !== 'landlord') {
      throw new ForbiddenException('Only agents and landlords can fund their wallet');
    }

    if (body.amount < 100) {
      throw new BadRequestException('Minimum funding amount is 100 NGN');
    }

    // Get user's virtual account
    const wallet = await this.flutterwaveService.getWalletByUserId(user.sub);
    if (!wallet || !wallet.customerCode) {
      throw new BadRequestException('Virtual account not found. Please contact support.');
    }

    // Initialize payment that will fund the virtual account
    const txRef = `FUND-${user.sub}-${Date.now()}`;
    const apiBase = process.env.API_BASE_URL || process.env.FRONTEND_URL?.replace('5173', '3000') || 'http://localhost:3000';
    const cleanApiBase = apiBase.replace(/\/$/, '');
    const callbackUrl = `${cleanApiBase}/agents/funding/callback?tx_ref=${encodeURIComponent(txRef)}`;
    
    // Frontend redirect URL after callback
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const cleanFrontendUrl = frontendUrl.replace(/\/$/, '');

    const paymentResult = await this.flutterwaveService.initializePayment({
      amount: body.amount,
      email: agent.email,
      name: agent.name,
      phone: agent.phone,
      tx_ref: txRef,
      callback_url: callbackUrl,
      meta: {
        userId: user.sub,
        type: 'wallet_funding',
        walletId: wallet.customerCode,
      },
      customizations: {
        title: 'House Me - Fund Virtual Account',
        description: `Fund your virtual account with ₦${body.amount.toLocaleString()}`,
        logo: 'https://house-me.vercel.app/logo.png',
      },
      // No subaccounts - payment goes to platform, then we transfer to virtual account
    });

    return {
      success: true,
      paymentLink: paymentResult.paymentLink,
      txRef: paymentResult.txRef,
    };
  }

  @Get('funding/callback')
  @ApiOperation({ summary: 'Callback endpoint for wallet funding payment verification' })
  @ApiResponse({ status: 200, description: 'Payment verified and wallet funded' })
  @ApiResponse({ status: 400, description: 'Payment verification failed' })
  async verifyFundingPayment(
    @Query('tx_ref') txRef: string,
    @Query('status') status?: string,
    @Res() res?: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const cleanFrontendUrl = frontendUrl.replace(/\/$/, '');
    
    try {
      // Verify payment with Flutterwave
      const verification = await this.flutterwaveService.verifyPaymentByReference(txRef);
      
      if (!verification.success || status !== 'successful') {
        // Redirect to frontend with failure status
        if (res) {
          return res.redirect(`${cleanFrontendUrl}/wallet?funded=failed`);
        }
        return { redirect: true, url: `${cleanFrontendUrl}/wallet?funded=failed` };
      }

      // Get payment metadata to find user
      const userId = verification.data?.meta?.userId;
      if (!userId) {
        if (res) {
          return res.redirect(`${cleanFrontendUrl}/wallet?funded=failed&error=user_not_found`);
        }
        return { redirect: true, url: `${cleanFrontendUrl}/wallet?funded=failed&error=user_not_found` };
      }

      // Get user's virtual account
      const wallet = await this.flutterwaveService.getWalletByUserId(userId);
      if (!wallet || !wallet.customerCode) {
        if (res) {
          return res.redirect(`${cleanFrontendUrl}/wallet?funded=failed&error=virtual_account_not_found`);
        }
        return { redirect: true, url: `${cleanFrontendUrl}/wallet?funded=failed&error=virtual_account_not_found` };
      }

      const amount = verification.data?.amount || 0;

      // Transfer funds from platform account to user's virtual account
      try {
        await this.flutterwaveService.fundVirtualAccount({
          account_reference: wallet.customerCode,
          amount: amount,
        });

        // Sync balance after funding
        const balanceData = await this.flutterwaveService.getAvailableBalance(userId);
        const actualBalance = balanceData.data?.available_balance || balanceData.data?.ledger_balance || 0;
        await this.usersService.updateWalletBalance(userId, actualBalance);

        // Redirect to success page
        if (res) {
          return res.redirect(`${cleanFrontendUrl}/wallet?funded=true&amount=${amount}`);
        }
        return { redirect: true, url: `${cleanFrontendUrl}/wallet?funded=true&amount=${amount}` };
      } catch (fundError: any) {
        // If funding fails, log but still mark payment as successful
        // Funds are in platform account and can be manually transferred
        console.error('Failed to fund virtual account:', fundError);
        if (res) {
          return res.redirect(`${cleanFrontendUrl}/wallet?funded=pending&amount=${amount}`);
        }
        return { redirect: true, url: `${cleanFrontendUrl}/wallet?funded=pending&amount=${amount}` };
      }
    } catch (error: any) {
      if (res) {
        return res.redirect(`${cleanFrontendUrl}/wallet?funded=failed&error=${encodeURIComponent(error.message || 'verification_failed')}`);
      }
      return { redirect: true, url: `${cleanFrontendUrl}/wallet?funded=failed&error=${encodeURIComponent(error.message || 'verification_failed')}` };
    }
  }
}

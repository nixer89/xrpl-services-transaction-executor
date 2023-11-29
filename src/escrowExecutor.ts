import * as scheduler from 'node-schedule';
import { Client, EscrowFinish, Wallet } from 'xrpl';
import { DB } from './db';
import { EscrowFinishDb } from './util/types';

require('log-timestamp');

export class EscrowExecutor {

    server:string = 'wss://s2.ripple.com';
    server_test:string ='wss://s.altnet.rippletest.net';
    xrpl_address:string = process.env.XRPL_ADDRESS || 'rpzR63sAd7fc4tR9c8k6MR3xhcZSpTAYKm';
    xrpl_secret:string = process.env.XRPL_SECRET || 'sskorjvv5bPtydsm5HtU1f2YxxA6D';

    api:Client;
    api_test:Client;
    db:DB = new DB();
    wallet:Wallet = Wallet.fromSeed(this.xrpl_secret);

    public async init() {
    
        this.api = new Client(this.server);
        this.api_test = new Client(this.server_test);
        
        await this.db.initDb("escrowExecutor");
        await this.db.ensureIndexes();

        scheduler.scheduleJob({minute: 0}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 5}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 10}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 15}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 20}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 25}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 30}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 35}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 40}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 45}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 50}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 55}, () => this.loadEscrowsFromDbAndExecute());
    }

    public async addNewEscrow(escrow: EscrowFinishDb): Promise<any> {
        return this.db.saveEscrow(escrow);
    }

    public async deleteEscrow(escrow: EscrowFinishDb): Promise<boolean> {
        return this.db.deleteEscrowFinish(escrow.account, escrow.sequence, escrow.testnet);
    }

    public async escrowExists(escrow: EscrowFinishDb): Promise<boolean> {
        return this.db.escrowExists(escrow);
    }

    public async getEscrowsForAccount(account: string, testnet: boolean): Promise<EscrowFinishDb[]> {
        return this.db.getEscrowFinishByAccount(account, testnet);
    }

    private async loadEscrowsFromDbAndExecute(): Promise<void> {
        //load escrows which had to be executed within the last our and execute them now
        let startDate:Date = new Date(0);

        let endDate:Date = new Date();
        endDate.setMinutes(endDate.getMinutes()-5);

        let escrows:EscrowFinishDb[] = await this.db.getEscrowFinishByDates(startDate, endDate);

        for(let i = 0; i < escrows.length; i++) {
            let success = await this.executeEscrowFinish(escrows[i]);
            if(success)
                await this.db.deleteEscrowFinish(escrows[i].account, escrows[i].sequence, escrows[i].testnet);
        }

        return Promise.resolve();
    }

    private async executeEscrowFinish(escrow: EscrowFinishDb, retry?: boolean): Promise<boolean> {
        try {
            console.log("preparing escrow: " + JSON.stringify(escrow));

            let apiToUse:Client = !escrow.testnet ? this.api : this.api_test;

            if(!apiToUse.isConnected())
                await apiToUse.connect();
            
            let escrowFinish:EscrowFinish = {
                Account: this.xrpl_address,
                OfferSequence: escrow.sequence,
                Owner: escrow.account,
                TransactionType: 'EscrowFinish'
            }

            console.log("submitting escrowFinish transaction")
            let result = await apiToUse.submitAndWait(escrowFinish, {autofill: true, wallet: this.wallet});
            console.log("submitting result: " + JSON.stringify(result));

            if(apiToUse.isConnected)
                await apiToUse.disconnect();
                
            if(!result || typeof(result.result.meta) === 'object' && result.result.meta.TransactionResult != "tesSUCCESS") {
                if(result && typeof(result.result.meta) === 'object' && ("tecNO_TARGET" === result.result.meta.TransactionResult || "tecNO_PERMISSION" === result.result.meta.TransactionResult)) {
                    //escrow does not exist anymore or cannot be finished (has condition or can only be cancelled)
                    return Promise.resolve(true);
                }
                else if(!retry)
                    return this.executeEscrowFinish(escrow, true);
                else
                    return Promise.resolve(false);
            } else {
                return Promise.resolve(true);
            }
        } catch(err) {
            console.log(err);
            return Promise.resolve(false);
        }
    }

    public getCurrentEscrowCount(): Promise<number> {
        return this.db.getCurrentEscrowCount();
    }

    public getNextOrLastEscrowRelease(sort: number): Promise<number> {
        return this.db.getNextOrLastEscrowRelease(sort);
    }
}

import * as scheduler from 'node-schedule';
import { RippleAPI } from 'ripple-lib';
import { EscrowExecution } from 'ripple-lib/dist/npm/transaction/escrow-execution';
import { Prepare } from 'ripple-lib/dist/npm/transaction/types';
import { FormattedSubmitResponse } from 'ripple-lib/dist/npm/transaction/submit';
import { DB } from './db';
import { EscrowFinish } from './util/types';
import * as config from './util/config';
require('console-stamp')(console, { 
    format: ':date(yyyy-mm-dd HH:MM:ss) :label' 
});

export class EscrowExecutor {

    server:string = 'wss://xrplcluster.com';
    server_test:string ='wss://s.altnet.rippletest.net';
    xrpl_address:string = process.env.XRPL_ADDRESS || 'rpzR63sAd7fc4tR9c8k6MR3xhcZSpTAYKm';
    xrpl_secret:string = process.env.XRPL_SECRET || 'sskorjvv5bPtydsm5HtU1f2YxxA6D';

    api:RippleAPI;
    api_test:RippleAPI = new RippleAPI({server: this.server_test, proxy: config.USE_PROXY ? config.PROXY_URL : null});
    db:DB = new DB();

    public async init() {
        if(config.USE_PROXY) {
            this.api = new RippleAPI({server: this.server, proxy: config.USE_PROXY ? config.PROXY_URL : null});
            this.api_test = new RippleAPI({server: this.server_test, proxy: config.USE_PROXY ? config.PROXY_URL : null});
        } else {
            this.api = new RippleAPI({server: this.server});
            this.api_test = new RippleAPI({server: this.server_test});
        }
        
        await this.db.initDb("escrowExecutor");
        await this.db.ensureIndexes();
        scheduler.scheduleJob({minute: 5}, () => this.loadEscrowsFromDbAndExecute());
    }

    public async addNewEscrow(escrow: EscrowFinish): Promise<any> {
        return this.db.saveEscrow(escrow);
    }

    public async deleteEscrow(escrow: EscrowFinish): Promise<boolean> {
        return this.db.deleteEscrowFinish(escrow.account, escrow.sequence, escrow.testnet);
    }

    public async escrowExists(escrow: EscrowFinish): Promise<boolean> {
        return this.db.escrowExists(escrow);
    }

    public async getEscrowsForAccount(account: string, testnet: boolean): Promise<EscrowFinish[]> {
        return this.db.getEscrowFinishByAccount(account, testnet);
    }

    private async loadEscrowsFromDbAndExecute(): Promise<void> {
        //load escrows which had to be executed within the last our and execute them now
        let startDate:Date = new Date(0);

        let endDate:Date = new Date();
        endDate.setMinutes(3, 59, 999);

        let escrows:EscrowFinish[] = await this.db.getEscrowFinishByDates(startDate, endDate);

        for(let i = 0; i < escrows.length; i++) {
            let success = await this.executeEscrowFinish(escrows[i]);
            if(success)
                await this.db.deleteEscrowFinish(escrows[i].account, escrows[i].sequence, escrows[i].testnet);
        }

        return Promise.resolve();
    }

    private async executeEscrowFinish(escrow: EscrowFinish, retry?: boolean): Promise<boolean> {
        try {
            console.log("preparing escrow: " + JSON.stringify(escrow));

            let apiToUse:RippleAPI = !escrow.testnet ? this.api : this.api_test;

            if(!apiToUse.isConnected())
                await apiToUse.connect();
            
            let escrowFinish:EscrowExecution = {
                owner: escrow.account,
                escrowSequence: escrow.sequence
            }

            let preparedEscrow:Prepare = await apiToUse.prepareEscrowExecution(this.xrpl_address, escrowFinish);

            console.log("finished preparing escrows: " + JSON.stringify(preparedEscrow));

            console.log("signing escrow");
            
            let signedEscrowFinish = await apiToUse.sign(preparedEscrow.txJSON, this.xrpl_secret);
            
            console.log("finished signing escrow: " + JSON.stringify(signedEscrowFinish));

            console.log("submitting escrowFinish transaction")
            let result:FormattedSubmitResponse = await apiToUse.submit(signedEscrowFinish.signedTransaction);
            console.log("submitting result: " + JSON.stringify(result));

            if(apiToUse.isConnected)
                await apiToUse.disconnect();
                
            if(!result || "tesSUCCESS" != result.resultCode) {
                if(result && ("tecNO_TARGET" == result.resultCode || "tecNO_PERMISSION"  == result.resultCode)) {
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

import { DB } from './db';
import { BurnTransactionDb, EscrowFinishDb } from './util/types';

require('log-timestamp');

export class BurnTrxHandler {

    db:DB = new DB();

    public async init() {
    
        await this.db.initDb("escrowExecutor");
        await this.db.ensureIndexes();
    }

    public async insertBurnTransaction(burnTx: BurnTransactionDb): Promise<any> {
        return this.db.saveBurnTransaction(burnTx);
    }

    public async getAllBurnTransactions(account: string, operationlimit: number): Promise<BurnTransactionDb[]> {
        return this.db.getBurnTrxByAccount(account, operationlimit);
    }

    public async getNonImportedBurnTransactions(account: string, operationlimit: number): Promise<BurnTransactionDb[]> {
        return this.db.getNonImportedBurnTrxByAccount(account, operationlimit);
    }

    public async getEscrowsForAccount(burnTx: BurnTransactionDb): Promise<EscrowFinishDb[]> {
        return this.db.setBurnTrxAsImported(burnTx)
    }
}

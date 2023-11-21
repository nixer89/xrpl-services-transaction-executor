export interface EscrowFinishDb {
    account: string,
    sequence: number,
    finishafter: Date,
    testnet: boolean
}
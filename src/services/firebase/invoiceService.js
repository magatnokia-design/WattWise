import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { isUnconfirmedEmpty, UNREACHABLE_READ_RESULT } from '../../utils/connectivity';

/**
 * Monthly statements.
 *
 * These documents are written entirely server-side - `processMonthlyInvoice`
 * builds one when a period closes, and `finalizeInvoice` rewrites it with the
 * official rates. Firestore rules make the collection read-only to the client
 * (`allow write: if false`), so everything that changes a billed figure goes
 * through the callable and nothing here writes directly.
 *
 * Until this existed the callable was reachable from nothing: every statement
 * stayed PENDING for ever, and the emailed PDF told the reader to tap a control
 * no screen had.
 */

const INVOICES_LIMIT = 12;

export const invoiceService = {
  /**
   * The most recent statements, newest first.
   *
   * Document ids are the billing month (`YYYY-MM`), which sorts correctly as a
   * string, so ordering by name needs no extra field.
   */
  getInvoices: async (userId, max = INVOICES_LIMIT) => {
    try {
      if (!userId) {
        return { success: false, error: 'User not authenticated' };
      }

      const invoicesRef = collection(db, 'users', userId, 'invoices');
      const snapshot = await getDocs(
        query(invoicesRef, orderBy('__name__', 'desc'), limit(max))
      );

      const invoices = snapshot.docs.map((docSnapshot) => ({
        billingMonth: docSnapshot.id,
        ...docSnapshot.data(),
      }));

      // A query resolves from the local cache when the phone is offline rather
      // than rejecting, so an empty result here is not evidence the account has
      // no statements - see isUnconfirmedEmpty.
      if (isUnconfirmedEmpty(invoices.length, snapshot.metadata)) {
        return UNREACHABLE_READ_RESULT;
      }

      return { success: true, data: invoices };
    } catch (error) {
      console.error('Error getting invoices:', error);
      return { success: false, error: error.message, code: error.code };
    }
  },

  /**
   * Locks one billing month to the official PELCO III rates for that month.
   *
   * `supplyRates` may carry the generation rate alone - that is the only figure
   * PELCO III publishes monthly, and the server fills the rest from the
   * defaults. The callable rejects an open period, so a month can only be
   * finalized once it has actually ended.
   *
   * No `withWriteTimeout` here: callables reject on their own when the phone is
   * offline, unlike a raw Firestore write which would sit pending for ever.
   */
  finalizeInvoice: async (billingMonth, supplyRates) => {
    try {
      const callable = httpsCallable(functions, 'finalizeInvoice');
      const result = await callable({ billingMonth, supplyRates });

      if (!result?.data?.success) {
        throw new Error(result?.data?.error || 'Failed to finalize this statement');
      }

      return { success: true, data: result.data };
    } catch (error) {
      console.error('Error finalizing invoice:', error);
      return {
        success: false,
        error: error.message,
        code: error.code,
      };
    }
  },
};

export default invoiceService;

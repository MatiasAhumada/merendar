-- AddForeignKey
ALTER TABLE "MerchandisePeriod" ADD CONSTRAINT "MerchandisePeriod_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseRemittance" ADD CONSTRAINT "MerchandiseRemittance_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

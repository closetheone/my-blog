-- CreateTable
CREATE TABLE "PostVersion" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostVersion_postId_id_idx" ON "PostVersion"("postId", "id" DESC);

-- AddForeignKey
ALTER TABLE "PostVersion" ADD CONSTRAINT "PostVersion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

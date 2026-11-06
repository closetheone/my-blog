-- CreateTable
CREATE TABLE "PostImage" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostImageRelation" (
    "postId" INTEGER NOT NULL,
    "imageId" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PostImage_url_key" ON "PostImage"("url");

-- CreateIndex
CREATE UNIQUE INDEX "PostImageRelation_postId_imageId_key" ON "PostImageRelation"("postId", "imageId");

-- AddForeignKey
ALTER TABLE "PostImageRelation" ADD CONSTRAINT "PostImageRelation_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostImageRelation" ADD CONSTRAINT "PostImageRelation_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "PostImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

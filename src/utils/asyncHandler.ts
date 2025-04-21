import { Request, Response, NextFunction } from "express"

const asyncHandler = (requestHandler: any) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(requestHandler(req, res, next)).catch((error) => next(res.status(error.statusCode || 500).json(
            {
                success: false,
                message: error.message
            }
        )))
    }
}

export { asyncHandler }

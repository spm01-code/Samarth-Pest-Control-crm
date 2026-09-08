import CompanySetting from "../model/companySettingModel.js";
import {
  getAllDocumentPreviews,
  validateYear,
} from "../utils/documentNumberService.js";

export const getCompanySettings = async (req, res) => {
  try {
    let settings = await CompanySetting.findOne();

    if (!settings) {
      settings = await CompanySetting.create({
        updatedBy: req.admin._id,
      });
    }

    const { previews, year } = await getAllDocumentPreviews(
      settings.numberingYear
    );

    return res.status(200).json({
      success: true,
      settings,
      numberingConfig: {
        configuredYear: year,
        previews,
      },
    });
  } catch (error) {
    console.error("Get company settings error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateCompanySettings = async (req, res) => {
  try {
    const updateData = { ...req.body };

    // Strip protected prefix and sequence fields if passed maliciously
    delete updateData.quotationPrefix;
    delete updateData.invoicePrefix;
    delete updateData.renewalPrefix;
    delete updateData.prefix;
    delete updateData.sequence;
    delete updateData.counter;
    delete updateData.documentNumber;

    // Validate numberingYear if supplied
    if (updateData.numberingYear !== undefined && updateData.numberingYear !== null) {
      try {
        updateData.numberingYear = validateYear(updateData.numberingYear);
      } catch (validationErr) {
        return res.status(400).json({
          success: false,
          message: validationErr.message,
        });
      }
    }

    const settings = await CompanySetting.findOneAndUpdate(
      {},
      {
        ...updateData,
        updatedBy: req.admin._id,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );

    const { previews, year } = await getAllDocumentPreviews(
      settings.numberingYear
    );

    return res.status(200).json({
      success: true,
      message: "Company settings updated successfully",
      settings,
      numberingConfig: {
        configuredYear: year,
        previews,
      },
    });
  } catch (error) {
    console.error("Update company settings error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
